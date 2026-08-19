import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NotificationEntity } from '../../domain/entities/notification.entity';

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/**
 * A way of getting a notification in front of someone.
 *
 * Channels are resolved by name from the outbox row, so adding one is a matter
 * of registering a provider — the service and the emitters never change.
 */
export interface NotificationChannel {
  /** Matches `outbox.channel`. */
  readonly name: string;

  /** False when the channel is configured off; its outbox rows are then skipped. */
  isEnabled(): boolean;

  /**
   * Resolves the address for this channel, or null when the recipient has none
   * reachable — a missing email is a skip, not a failure to retry forever.
   */
  resolveDestination(input: {
    email?: string | null;
    phone?: string | null;
  }): string | null;

  /** Throwing marks the attempt failed and schedules a retry. */
  send(
    notification: NotificationEntity,
    outbox: NotificationOutboxEntity,
  ): Promise<void>;
}
