import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { AppConfig } from '../../../../shared/config/configuration';
import { NotificationChannel } from '../../application/ports/notification-channel';
import { ConsoleEmailChannel } from './console-email.channel';
import { ResendEmailChannel } from './resend-email.channel';

const logger = new Logger('EmailChannelFactory');

/**
 * Picks the email adapter for this environment.
 *
 * Both adapters satisfy the same port, so this is the only place that knows
 * which one is live. Keeping the choice in a pure function rather than inline
 * in the module means the fallback rule is testable — and the rule is the part
 * worth testing, because getting it wrong means customer mail is logged to a
 * container's stdout and nobody finds out.
 */
export function createEmailChannel(
  config: ConfigService<AppConfig, true>,
): NotificationChannel {
  const apiKey = config.get('notifications.resendApiKey', { infer: true });
  const configured = typeof apiKey === 'string' && apiKey.trim().length > 0;

  if (configured) {
    return new ResendEmailChannel(new Resend(apiKey.trim()), config);
  }

  const emailEnabled = config.get('notifications.emailEnabled', {
    infer: true,
  });
  const isProduction = config.get('env', { infer: true }) === 'production';

  // The Joi schema already refuses this combination at boot. This is the
  // second line of defence: if that gate is ever loosened, production must
  // still fail loudly rather than quietly log every customer email.
  if (isProduction && emailEnabled) {
    throw new Error(
      'notifications email is enabled but RESEND_API_KEY is not set; ' +
        'refusing to fall back to the console channel in production',
    );
  }

  logger.warn(
    'RESEND_API_KEY is not set — email notifications will be logged, not sent',
  );
  return new ConsoleEmailChannel(config);
}
