import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../shared/config/configuration';
import { NotificationChannel } from '../../application/ports/notification-channel';
import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NotificationEntity } from '../../domain/entities/notification.entity';

/**
 * Email, logged rather than sent.
 *
 * The whole delivery path — fan-out, retries, backoff, dedupe — is exercised
 * with this adapter, so swapping in a real provider is a provider change and
 * nothing else. Core has no mail credential of its own today: the Resend setup
 * lives in autoboost-backend-auth and is two hardcoded methods, not something
 * importable.
 */
@Injectable()
export class ConsoleEmailChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger(ConsoleEmailChannel.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isEnabled(): boolean {
    return this.config.get('notifications.emailEnabled', { infer: true });
  }

  resolveDestination(input: { email?: string | null }): string | null {
    const email = input.email?.trim();
    return email ? email : null;
  }

  send(
    notification: NotificationEntity,
    outbox: NotificationOutboxEntity,
  ): Promise<void> {
    this.logger.log(
      `[email → ${outbox.destination ?? 'unknown'}] ${notification.title}` +
        (notification.body ? ` — ${notification.body}` : ''),
    );
    return Promise.resolve();
  }
}
