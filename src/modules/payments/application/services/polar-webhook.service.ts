import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { OrderPaymentEntity } from '../../../orders/domain/entities/order-payment.entity';
import { NotificationEmittedEvent } from '../../../notifications/domain/notification-emitted.event';
import { NotificationEventKey } from '../../../notifications/domain/notification-event';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { WebhookEventEntity } from '../../domain/entities/webhook-event.entity';

type PolarWebhookPayload = {
  type: string;
  timestamp?: Date | string;
  data: {
    id: string;
    checkoutId?: string | null;
    metadata?: Record<string, unknown>;
    totalAmount?: number;
    currency?: string;
  };
};

@Injectable()
export class PolarWebhookService {
  private readonly logger = new Logger(PolarWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WebhookEventEntity)
    private readonly webhookRepo: Repository<WebhookEventEntity>,
    @InjectRepository(PolarCheckoutEntity)
    private readonly checkoutRepo: Repository<PolarCheckoutEntity>,
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


  async handle(event: PolarWebhookPayload): Promise<void> {
    const polarEventId = `${event.type}:${event.data.id}`;

    try {
      await this.webhookRepo.save(
        this.webhookRepo.create({
          polarEventId,
          eventType: event.type,
          payloadJson: JSON.parse(JSON.stringify(event)) as Record<
            string,
            unknown
          >,
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        this.logger.debug(`Duplicate webhook ${polarEventId}, skipping`);
        return;
      }
      throw e;
    }

    try {
      if (event.type === 'order.paid') {
        await this.handleOrderPaid(event);
      } else if (event.type === 'order.refunded') {
        await this.handleOrderRefunded(event);
      } else if (
        event.type === 'checkout.updated' ||
        event.type === 'checkout.expired'
      ) {
        await this.handleCheckoutStatus(event);
      }

      await this.webhookRepo.update(
        { polarEventId },
        { processedAt: new Date() },
      );
    } catch (err) {
      this.logger.error(`Failed processing ${polarEventId}`, err);
      throw err;
    }
  }

  private resolveOrderId(event: PolarWebhookPayload): string | null {
    const meta = event.data.metadata;
    const orderId = meta?.orderId;
    return typeof orderId === 'string' ? orderId : null;
  }

  private async handleOrderPaid(event: PolarWebhookPayload): Promise<void> {
    const orderId = this.resolveOrderId(event);
    if (!orderId) {
      this.logger.warn(`order.paid ${event.data.id} missing metadata.orderId`);
      return;
    }

    const amount = (event.data.totalAmount ?? 0) / 100;

    const paid = await this.dataSource.transaction(async (tx) => {
      const order = await tx
        .getRepository(OrderEntity)
        .findOne({ where: { id: orderId } });
      if (!order) {
        this.logger.warn(`order.paid: internal order ${orderId} not found`);
        return null;
      }

      if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        await tx.getRepository(OrderEntity).save(order);
      }

      const checkoutQb = tx.getRepository(PolarCheckoutEntity);
      let checkout = event.data.checkoutId
        ? await checkoutQb.findOne({
            where: { polarCheckoutId: event.data.checkoutId },
          })
        : null;
      if (!checkout) {
        checkout = await checkoutQb.findOne({
          where: { orderId },
          order: { createdAt: 'DESC' },
        });
      }
      if (checkout) {
        checkout.polarOrderId = event.data.id;
        checkout.status = 'succeeded';
        await checkoutQb.save(checkout);
      }

      const existingPayment = await tx
        .getRepository(OrderPaymentEntity)
        .findOne({
          where: { orderId, transactionRef: event.data.id },
        });
      if (!existingPayment) {
        await tx.getRepository(OrderPaymentEntity).save(
          tx.getRepository(OrderPaymentEntity).create({
            orderId,
            provider: 'polar',
            amount: amount || order.grandTotal,
            status: 'paid',
            transactionRef: event.data.id,
            paidAt: new Date(),
          }),
        );
      }

      return order;
    });

    // After commit: a listener must never see a payment a rollback is about to
    // undo. Polar redelivers on failure, and the notification is keyed on
    // (event, order, recipient), so a replay records nothing new.
    if (paid) this.emitOrderEvent('payment.received', paid);
  }

  private async handleOrderRefunded(event: PolarWebhookPayload): Promise<void> {
    const orderId = this.resolveOrderId(event);
    if (!orderId) return;

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;

    order.paymentStatus = 'refunded';
    const saved = await this.orderRepo.save(order);
    this.emitOrderEvent('payment.refunded', saved);
  }

  private async handleCheckoutStatus(
    event: PolarWebhookPayload,
  ): Promise<void> {
    const checkoutId = event.data.id;
    const checkout = await this.checkoutRepo.findOne({
      where: { polarCheckoutId: checkoutId },
    });
    if (!checkout) return;

    if (event.type === 'checkout.expired') {
      checkout.status = 'expired';
    } else {
      checkout.status = 'open';
    }
    await this.checkoutRepo.save(checkout);
  }
}
