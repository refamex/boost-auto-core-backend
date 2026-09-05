import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../shared/config/configuration';
import { NotificationChannel } from '../../application/ports/notification-channel';
import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NotificationEntity } from '../../domain/entities/notification.entity';

export const RESEND_CLIENT = Symbol('RESEND_CLIENT');

/**
 * Structural shape of the provider client, mirroring the auth service's own
 * mailer port. Declared here rather than imported from the SDK so this channel
 * and its tests carry no dependency on the vendor's types.
 */
export interface EmailSender {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }): Promise<{
      data: unknown;
      error: {
        message: string;
        statusCode: number | null;
        name: string;
      } | null;
    }>;
  };
}

/**
 * Email, actually sent.
 *
 * Drops into the slot `ConsoleEmailChannel` held, which is why nothing else in
 * the notification path changes: fan-out, retries, backoff and dedupe were
 * already exercised against the console adapter.
 *
 * The one contract that matters here is the port's: "Throwing marks the
 * attempt failed and schedules a retry." The auth service's mailer logs
 * provider errors and returns normally; copying that would mark a message the
 * provider REFUSED as delivered and drop it silently. Every failure path below
 * therefore throws.
 */
@Injectable()
export class ResendEmailChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger(ResendEmailChannel.name);

  constructor(
    @Inject(RESEND_CLIENT) private readonly resend: EmailSender,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  isEnabled(): boolean {
    return this.config.get('notifications.emailEnabled', { infer: true });
  }

  resolveDestination(input: { email?: string | null }): string | null {
    const email = input.email?.trim();
    return email ? email : null;
  }

  async send(
    notification: NotificationEntity,
    outbox: NotificationOutboxEntity,
  ): Promise<void> {
    const to = outbox.destination;
    if (!to) {
      throw new Error('email outbox row has no destination');
    }

    const from = this.config.get('notifications.mailFrom', { infer: true });

    let error: { message: string; name: string } | null;
    try {
      ({ error } = await this.resend.emails.send({
        from,
        to,
        subject: notification.title,
        html: this.render(notification),
      }));
    } catch (e) {
      // The SDK REJECTS on transport failures and on some validation errors,
      // and its own message echoes the recipient exactly as the returned
      // error object does. Whatever escapes this method is copied verbatim
      // into the outbox row's failure reason, so this path needs the same
      // redaction the returned-error path below already gets. Leaving it out
      // would have kept the leak open through a second door.
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Resend threw for notification ${notification.id}: ${redactAddresses(reason)}`,
      );
      throw new Error(`email delivery failed: ${redactAddresses(reason)}`);
    }

    if (error) {
      this.logger.error(
        `Resend refused notification ${notification.id}: ${error.name}`,
      );
      // The provider echoes the offending recipient in its own validation
      // messages, and this string lands in the outbox row's failure reason,
      // which is readable wherever outbox rows are. Redacting is not
      // cosmetic: without it every rejected send copies a customer address
      // into a second store nobody is treating as PII.
      throw new Error(
        `email delivery refused by provider: ${redactAddresses(error.message)}`,
      );
    }
  }

  private render(notification: NotificationEntity): string {
    const title = escapeHtml(notification.title);
    const body = notification.body ? escapeHtml(notification.body) : '';

    return [
      `<h2>${title}</h2>`,
      body ? `<p>${body}</p>` : '',
      '<p style="color:#888;font-size:12px">Boost Auto</p>',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

/**
 * Strips anything address-shaped out of provider text before it is persisted.
 *
 * Deliberately broad: it is better to redact a token that merely looks like an
 * address than to leak one that is. The marker is left in place so a failure
 * reason still reads as "something was here", rather than looking truncated.
 */
export function redactAddresses(text: string): string {
  return text.replace(/[^\s<>()[\]",;:]+@[^\s<>()[\]",;:]+/g, '[redacted]');
}

/**
 * Notification titles and bodies are assembled from order numbers, tracking
 * codes and customer-supplied reference strings, so they reach this template
 * as untrusted text.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
