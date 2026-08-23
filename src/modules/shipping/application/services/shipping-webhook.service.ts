import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { NotificationEmittedEvent } from '../../../notifications/domain/notification-emitted.event';
import { NotificationEventKey } from '../../../notifications/domain/notification-event';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { ShippingWebhookEventEntity } from '../../domain/entities/shipping-webhook-event.entity';

export type SkydropxWebhookPayload = {
  type: string;
  id?: string;
  data: {
    id?: string;
    shipment_id?: string;
    tracking_number?: string;
    status?: string;
    description?: string;
    occurred_at?: string;
  };
};

// Mapea estados de Skydropx → shippingStatus del pedido.
const ORDER_STATUS_MAP: Record<string, string> = {
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  exception: 'exception',
  cancelled: 'cancelled',
};

// De los estados del pedido a los avisos al cliente. `cancelled` no está: la
// cancelación del envío ya se avisa desde ShipmentService.cancel, y avisar dos
// veces por lo mismo es peor que no avisar.
const SHIPPING_EVENT_MAP: Record<string, NotificationEventKey | undefined> = {
  in_transit: 'shipment.in_transit',
  out_for_delivery: 'shipment.out_for_delivery',
  delivered: 'shipment.delivered',
  exception: 'shipment.exception',
};

@Injectable()
export class ShippingWebhookService {
  private readonly logger = new Logger(ShippingWebhookService.name);

  constructor(
    @InjectRepository(ShippingWebhookEventEntity)
    private readonly webhookRepo: Repository<ShippingWebhookEventEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipmentRepo: Repository<ShipmentEntity>,
    @InjectRepository(ShipmentTrackingEventEntity)
    private readonly trackingRepo: Repository<ShipmentTrackingEventEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly events: EventEmitter2,
  ) {}

  async handle(event: SkydropxWebhookPayload): Promise<void> {
    const eventId = `${event.type}:${event.id ?? event.data.id ?? event.data.shipment_id ?? ''}`;

    try {
      await this.webhookRepo.save(
        this.webhookRepo.create({
          skydropxEventId: eventId,
          eventType: event.type,
          payloadJson: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
        }),
      );
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        this.logger.debug(`Duplicate shipping webhook ${eventId}, skipping`);
        return;
      }
      throw e;
    }

    try {
      await this.applyTracking(event);
      await this.webhookRepo.update({ skydropxEventId: eventId }, { processedAt: new Date() });
    } catch (err) {
      this.logger.error(`Failed processing ${eventId}`, err);
      throw err;
    }
  }

  private async findShipment(event: SkydropxWebhookPayload): Promise<ShipmentEntity | null> {
    const skydropxId = event.data.shipment_id ?? event.data.id;
    if (skydropxId) {
      const byId = await this.shipmentRepo.findOne({
        where: { skydropxShipmentId: String(skydropxId) },
      });
      if (byId) return byId;
    }
    if (event.data.tracking_number) {
      return this.shipmentRepo.findOne({
        where: { trackingNumber: event.data.tracking_number },
      });
    }
    return null;
  }

  private async applyTracking(event: SkydropxWebhookPayload): Promise<void> {
    const shipment = await this.findShipment(event);
    if (!shipment) {
      this.logger.warn(`Webhook ${event.type}: shipment not found for ${JSON.stringify(event.data)}`);
      return;
    }

    const status = event.data.status;
    if (status) {
      shipment.status = status;
      await this.shipmentRepo.save(shipment);

      const orderStatus = ORDER_STATUS_MAP[status];
      if (orderStatus) {
        const order = await this.orderRepo.findOne({ where: { id: shipment.orderId } });
        if (order) {
          order.shippingStatus = orderStatus;
          await this.orderRepo.save(order);

          // Only the five mapped statuses reach the order, and those are exactly
          // the ones worth telling a customer about. Unmapped carrier states
          // (label_generated, picked_up, …) update the shipment and stay quiet.
          const eventKey = SHIPPING_EVENT_MAP[orderStatus];
          if (eventKey) {
            const payload: NotificationEmittedEvent = {
              eventKey,
              recipientUserId: order.customerId,
              entityType: 'order',
              entityId: order.id,
              reference: order.orderNumber,
              contact: { email: order.shipToEmail, phone: order.shipToPhone },
              trackingNumber: shipment.trackingNumber,
              carrierName: shipment.carrierName,
            };
            this.events.emit(eventKey, payload);
          }
        }
      }
    }

    await this.trackingRepo.save(
      this.trackingRepo.create({
        shipmentId: shipment.id,
        status: status ?? 'unknown',
        description: event.data.description ?? null,
        occurredAt: event.data.occurred_at ? new Date(event.data.occurred_at) : new Date(),
        rawJson: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
      }),
    );
  }
}
