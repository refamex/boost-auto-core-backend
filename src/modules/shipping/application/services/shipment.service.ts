import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfig } from '../../../../shared/config/configuration';
import { NotificationEmittedEvent } from '../../../notifications/domain/notification-emitted.event';
import { NotificationEventKey } from '../../../notifications/domain/notification-event';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { SKYDROPX_CLIENT, SkydropxClient } from '../ports/skydropx.client';

const CANCELLABLE_STATUSES = ['created', 'pending', 'label_generated', 'ready'];

@Injectable()
export class ShipmentService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(SKYDROPX_CLIENT) private readonly skydropx: SkydropxClient,
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    @InjectRepository(ShipmentTrackingEventEntity)
    private readonly trackingRepo: Repository<ShipmentTrackingEventEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Announces an order transition to whoever is listening.
   *
   * Notifications live outside this module and are not imported here — the
   * dependency runs one way, through the emitter. Contact comes off the order
   * because this handler has no user context at all: the webhook is public.
   */
  private emitOrderEvent(
    eventKey: NotificationEventKey,
    order: OrderEntity,
    extra: { trackingNumber?: string | null; carrierName?: string | null } = {},
  ): void {
    const payload: NotificationEmittedEvent = {
      eventKey,
      recipientUserId: order.customerId,
      entityType: 'order',
      entityId: order.id,
      reference: order.orderNumber,
      contact: { email: order.shipToEmail, phone: order.shipToPhone },
      ...extra,
    };
    this.events.emit(eventKey, payload);
  }


  private assertEnabled(): void {
    if (!this.config.get('skydropx.enabled', { infer: true })) {
      throw new ServiceUnavailableException(
        'Skydropx shipping is not enabled (SKYDROPX_ENABLED=false)',
      );
    }
  }

  /** Crea el envío en Skydropx a partir de una cotización + rate elegido. */
  async createForOrder(
    orderId: string,
    quotationId: string,
    rateId: string,
  ): Promise<ShipmentEntity> {
    this.assertEnabled();

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const existing = await this.shipmentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException('An active shipment already exists for this order');
    }

    const result = await this.skydropx.createShipment({ quotationId, rateId });

    const shipment = await this.shipmentRepo.save(
      this.shipmentRepo.create({
        orderId,
        skydropxShipmentId: result.skydropxShipmentId,
        quotationId,
        rateId,
        carrierName: result.carrierName ?? null,
        serviceLevel: result.serviceLevel ?? null,
        trackingNumber: result.trackingNumber ?? null,
        trackingUrl: result.trackingUrl ?? null,
        labelUrl: result.labelUrl ?? null,
        status: result.status,
        amount: result.amount ?? null,
        currency: (result.currency ?? 'MXN').toUpperCase(),
      }),
    );

    order.shippingStatus = 'shipment_created';
    await this.orderRepo.save(order);

    // The one moment a tracking number first exists, so the copy can carry it.
    this.emitOrderEvent('shipment.created', order, {
      trackingNumber: shipment.trackingNumber,
      carrierName: shipment.carrierName,
    });

    return shipment;
  }

  async cancel(shipmentId: string): Promise<ShipmentEntity> {
    this.assertEnabled();

    const shipment = await this.findById(shipmentId);
    if (shipment.status === 'cancelled') {
      throw new ConflictException('Shipment is already cancelled');
    }
    if (!CANCELLABLE_STATUSES.includes(shipment.status)) {
      throw new ConflictException(`Shipment in status '${shipment.status}' cannot be cancelled`);
    }

    await this.skydropx.cancelShipment(shipment.skydropxShipmentId);

    shipment.status = 'cancelled';
    await this.shipmentRepo.save(shipment);

    const order = await this.orderRepo.findOne({ where: { id: shipment.orderId } });
    if (order) {
      order.shippingStatus = 'cancelled';
      await this.orderRepo.save(order);
    }

    return shipment;
  }

  /** Consulta tracking on-demand contra Skydropx y persiste eventos nuevos. */
  async getTracking(shipmentId: string): Promise<ShipmentEntity> {
    const shipment = await this.findById(shipmentId);
    if (!shipment.trackingNumber || !shipment.carrierName) {
      return shipment;
    }

    const tracking = await this.skydropx.getTracking(
      shipment.trackingNumber,
      shipment.carrierName,
    );

    if (tracking.status && tracking.status !== shipment.status) {
      shipment.status = tracking.status;
      await this.shipmentRepo.save(shipment);
    }

    for (const event of tracking.events) {
      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
      const already = await this.trackingRepo.findOne({
        where: {
          shipmentId: shipment.id,
          status: event.status,
          occurredAt: occurredAt ?? IsNull(),
        },
      });
      if (!already) {
        await this.trackingRepo.save(
          this.trackingRepo.create({
            shipmentId: shipment.id,
            status: event.status,
            description: event.description ?? null,
            occurredAt,
          }),
        );
      }
    }

    return this.findById(shipmentId);
  }

  async findById(id: string): Promise<ShipmentEntity> {
    const found = await this.shipmentRepo.findOne({
      where: { id },
      relations: ['trackingEvents'],
    });
    if (!found) throw new NotFoundException(`Shipment ${id} not found`);
    return found;
  }

  async findByOrder(orderId: string): Promise<ShipmentEntity> {
    const found = await this.shipmentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
      relations: ['trackingEvents'],
    });
    if (!found) throw new NotFoundException(`No shipment for order ${orderId}`);
    return found;
  }
}
