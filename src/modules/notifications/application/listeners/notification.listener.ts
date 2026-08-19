import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationEmittedEvent } from '../../domain/notification-emitted.event';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly notifications: NotificationService) {}

  @OnEvent('order.**')
  @OnEvent('payment.**')
  @OnEvent('shipment.**')
  @OnEvent('invoice.**')
  async handle(event: NotificationEmittedEvent): Promise<void> {
    // Errors are swallowed deliberately. EventEmitter2 has no supervisor: an
    // uncaught rejection here becomes an unhandled promise rejection, and since
    // these events are emitted from inside webhook handlers, that would turn a
    // failed notification into a failed webhook the provider then retries.
    // Losing one feed row is strictly better than reprocessing a payment.
    try {
      await this.notifications.create({
        eventKey: event.eventKey,
        recipientUserId: event.recipientUserId,
        entityType: event.entityType,
        entityId: event.entityId,
        context: {
          reference: event.reference,
          trackingNumber: event.trackingNumber,
          carrierName: event.carrierName,
        },
        contact: event.contact,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Failed to record notification ${event.eventKey} for ${event.entityType} ${event.entityId}: ${reason}`,
      );
    }
  }
}
