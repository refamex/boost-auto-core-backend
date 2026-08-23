import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '../../application/ports/notification-channel';

/**
 * The in-app feed.
 *
 * Delivery is a no-op on purpose: writing the notification row *is* the
 * delivery. The outbox row exists anyway so the feed is not a special case —
 * every channel is visible in the same table with the same status vocabulary.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'inapp';

  isEnabled(): boolean {
    return true;
  }

  resolveDestination(): string | null {
    return null;
  }

  send(): Promise<void> {
    return Promise.resolve();
  }
}
