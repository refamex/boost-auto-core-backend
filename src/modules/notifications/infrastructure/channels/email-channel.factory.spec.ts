import { ConsoleEmailChannel } from './console-email.channel';
import { createEmailChannel } from './email-channel.factory';
import { ResendEmailChannel } from './resend-email.channel';

describe('createEmailChannel', () => {
  const makeConfig = (over: Record<string, unknown> = {}) =>
    ({
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'notifications.emailEnabled': true,
          'notifications.resendApiKey': 're_live_key',
          'notifications.mailFrom': 'Auto Boost <no-reply@autoboost.mx>',
          env: 'development',
          ...over,
        };
        return values[key];
      }),
    }) as never;

  it('uses the real provider when a credential is present', () => {
    expect(createEmailChannel(makeConfig())).toBeInstanceOf(ResendEmailChannel);
  });

  it('falls back to the console channel when no credential is configured', () => {
    expect(
      createEmailChannel(
        makeConfig({ 'notifications.resendApiKey': undefined }),
      ),
    ).toBeInstanceOf(ConsoleEmailChannel);
  });

  it('falls back to the console channel on a blank credential, not a broken client', () => {
    expect(
      createEmailChannel(makeConfig({ 'notifications.resendApiKey': '   ' })),
    ).toBeInstanceOf(ConsoleEmailChannel);
  });

  // The Joi gate already refuses to boot production without the credential
  // when email is enabled. This is the second line: if that gate is ever
  // loosened, a production boot must not silently degrade to logging mail.
  it('REFUSES to fall back silently in production when email is enabled', () => {
    expect(() =>
      createEmailChannel(
        makeConfig({
          env: 'production',
          'notifications.resendApiKey': undefined,
        }),
      ),
    ).toThrow(/refusing to fall back/i);
  });

  it('still allows the console channel in production when email is switched off', () => {
    expect(
      createEmailChannel(
        makeConfig({
          env: 'production',
          'notifications.emailEnabled': false,
          'notifications.resendApiKey': undefined,
        }),
      ),
    ).toBeInstanceOf(ConsoleEmailChannel);
  });
});
