import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { EmailSender, ResendEmailChannel } from './resend-email.channel';

function makeNotification(
  over: Partial<NotificationEntity> = {},
): NotificationEntity {
  return {
    id: 'notif-1',
    title: 'Your order is on its way',
    body: 'Tracking number TRACK123',
    ...over,
  } as NotificationEntity;
}

function makeOutbox(
  over: Partial<NotificationOutboxEntity> = {},
): NotificationOutboxEntity {
  return {
    id: 'out-1',
    channel: 'email',
    destination: 'customer@example.com',
    ...over,
  } as NotificationOutboxEntity;
}

describe('ResendEmailChannel', () => {
  const send = jest.fn();
  const resend: EmailSender = { emails: { send } };

  const makeConfig = (over: Record<string, unknown> = {}) => ({
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'notifications.emailEnabled': true,
        'notifications.mailFrom': 'Auto Boost <no-reply@autoboost.mx>',
        ...over,
      };
      return values[key];
    }),
  });

  const makeChannel = (over: Record<string, unknown> = {}) =>
    new ResendEmailChannel(resend, makeConfig(over) as never);

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
  });

  it('answers to the same channel name the outbox rows carry', () => {
    expect(makeChannel().name).toBe('email');
  });

  describe('isEnabled', () => {
    it('is off when email is configured off, even with a client present', () => {
      expect(
        makeChannel({ 'notifications.emailEnabled': false }).isEnabled(),
      ).toBe(false);
    });

    it('is on when email is enabled and a sender is present', () => {
      expect(makeChannel().isEnabled()).toBe(true);
    });
  });

  describe('resolveDestination', () => {
    it('trims the address', () => {
      expect(makeChannel().resolveDestination({ email: '  a@b.com  ' })).toBe(
        'a@b.com',
      );
    });

    it('returns null for a missing or blank address, so the row is skipped not retried forever', () => {
      expect(makeChannel().resolveDestination({ email: null })).toBeNull();
      expect(makeChannel().resolveDestination({ email: '   ' })).toBeNull();
    });
  });

  describe('send', () => {
    it('delivers to the outbox destination with the configured sender', async () => {
      await makeChannel().send(makeNotification(), makeOutbox());

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Auto Boost <no-reply@autoboost.mx>',
          to: 'customer@example.com',
          subject: 'Your order is on its way',
        }),
      );
    });

    it('carries the notification body into the message', async () => {
      await makeChannel().send(makeNotification(), makeOutbox());

      const payload = send.mock.calls[0][0] as { html: string };
      expect(payload.html).toContain('Tracking number TRACK123');
    });

    // The port's contract is explicit: "Throwing marks the attempt failed and
    // schedules a retry." A provider error that is only logged would mark a
    // never-delivered message as delivered and drop it silently — which is
    // the exact failure this channel exists to end.
    it('THROWS when the provider reports an error, so the outbox retries', async () => {
      send.mockResolvedValue({
        data: null,
        error: { message: 'rate limited', statusCode: 429, name: 'rate_limit' },
      });

      await expect(
        makeChannel().send(makeNotification(), makeOutbox()),
      ).rejects.toThrow(/rate limited/);
    });

    it('THROWS when the provider call itself rejects', async () => {
      send.mockRejectedValue(new Error('socket hang up'));

      await expect(
        makeChannel().send(makeNotification(), makeOutbox()),
      ).rejects.toThrow(/socket hang up/);
    });

    // The previous version of this test stubbed the provider message as the
    // bare word 'invalid', so leaking was impossible and no mutation of the
    // source could turn it red. The provider's real validation errors echo
    // the offending recipient, which is the only vector that matters.
    it('redacts the recipient out of the provider message before it reaches the outbox', async () => {
      send.mockResolvedValue({
        data: null,
        error: {
          message:
            'Invalid `to` field: customer@example.com is not a valid address',
          statusCode: 422,
          name: 'validation_error',
        },
      });

      const err = await makeChannel()
        .send(makeNotification(), makeOutbox())
        .then(() => null)
        .catch((e: Error) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).not.toContain('customer@example.com');
      // Not merely absent: the marker proves the text was carried through and
      // scrubbed, rather than dropped, emptied or replaced wholesale.
      expect(err?.message).toContain('[redacted]');
      expect(err?.message).toContain('Invalid `to` field');
    });

    it('escapes markup in the title and body before it reaches the provider', async () => {
      await makeChannel().send(
        makeNotification({
          title: 'Order <script>alert(1)</script>',
          body: 'Ref "A&B" <b>bold</b>',
        }),
        makeOutbox(),
      );

      const payload = send.mock.calls[0][0] as { html: string };
      expect(payload.html).not.toContain('<script>');
      expect(payload.html).toContain('&lt;script&gt;');
      expect(payload.html).toContain('&amp;');
    });
  });
});
