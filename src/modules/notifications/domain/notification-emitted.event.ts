import { NotificationEventKey } from './notification-event';

/**
 * What an emitting module publishes.
 *
 * The payload carries everything needed to write the notification, so the
 * listener never queries back for the order it was just told about. That also
 * keeps the notifications module from importing orders, payments or shipping —
 * the dependency runs one way only, through the emitter.
 */
export interface NotificationEmittedEvent {
  eventKey: NotificationEventKey;
  /** JWT `sub` of the recipient — for customer events this is `order.customerId`. */
  recipientUserId: string;
  entityType: 'order' | 'invoice';
  entityId: string;
  /** Human-facing document number shown in the copy. */
  reference: string;
  /** Contact frozen on the source document at creation time. */
  contact?: { email?: string | null; phone?: string | null };
  trackingNumber?: string | null;
  carrierName?: string | null;
}
