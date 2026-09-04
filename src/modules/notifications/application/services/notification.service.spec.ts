import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NOTIFICATION_CHANNELS } from '../ports/notification-channel';
import { NotificationService } from './notification.service';

const RECIPIENT = 'user-1';
const ORDER_ID = 'order-1';

describe('NotificationService', () => {
  const repo = {
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    update: jest.fn().mockResolvedValue({ affected: 3 }),
  };

  // The transaction callback gets repositories keyed by entity class, following
  // polar-webhook.service.spec.ts — the only precedent in this repo.
  const notificationTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: Record<string, unknown>) =>
      Promise.resolve({ id: 'notif-1', ...x }),
    ),
  };
  const outboxTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const txRepos = {
    getRepository: jest.fn((entity: unknown) =>
      entity === NotificationEntity ? notificationTxRepo : outboxTxRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(txRepos)),
  };

  const inapp = {
    name: 'inapp',
    isEnabled: jest.fn(() => true),
    resolveDestination: jest.fn(() => null),
    send: jest.fn(),
  };
  const email = {
    name: 'email',
    isEnabled: jest.fn(() => true),
    resolveDestination: jest.fn(
      (c: { email?: string | null }) => c.email ?? null,
    ),
    send: jest.fn(),
  };

  // Jest hands mock arguments back as `any`; narrow them once here instead of
  // sprinkling casts through the assertions.
  const queuedChannels = (): Record<string, unknown>[] => {
    const calls = outboxTxRepo.save.mock.calls as unknown as [
      Record<string, unknown>[],
    ][];
    return calls[0]?.[0] ?? [];
  };
  const findAndCountArg = (): { where: Record<string, unknown> } => {
    const calls = repo.findAndCount.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][];
    return calls[0][0];
  };
  const updateCriteria = (): Record<string, unknown> => {
    const calls = repo.update.mock.calls as unknown as [
      Record<string, unknown>,
    ][];
    return calls[0][0];
  };

  let service: NotificationService;

  const input = {
    eventKey: 'payment.received' as const,
    recipientUserId: RECIPIENT,
    entityType: 'order',
    entityId: ORDER_ID,
    context: { reference: 'ORD-1' },
    contact: { email: 'cliente@example.com' },
  };

  /**
   * A row as it sits in the table today: the `link` column still holds the
   * Spanish path that was stamped on it before the storefront routes were
   * matched. Reads must not hand this back.
   */
  const storedRow = {
    id: 'notif-1',
    recipientUserId: RECIPIENT,
    eventKey: 'payment.received',
    entityType: 'order',
    entityId: ORDER_ID,
    link: `/cuenta/pedido/${ORDER_ID}`,
    readAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    inapp.isEnabled.mockReturnValue(true);
    email.isEnabled.mockReturnValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(NotificationEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
        { provide: NOTIFICATION_CHANNELS, useValue: [inapp, email] },
      ],
    }).compile();
    service = moduleRef.get(NotificationService);
  });

  describe('create', () => {
    it('renders the copy from the catalogue', async () => {
      await service.create(input);
      expect(notificationTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Recibimos tu pago del pedido ORD-1',
          category: 'invoice',
        }),
      );
    });

    it('stamps a dedupe key and a deep link', async () => {
      await service.create(input);
      expect(notificationTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: `payment.received:${ORDER_ID}:${RECIPIENT}`,
          link: `/orders/${ORDER_ID}`,
        }),
      );
    });

    it('queues one delivery per enabled channel', async () => {
      await service.create(input);
      expect(queuedChannels().map((d) => d.channel)).toEqual([
        'inapp',
        'email',
      ]);
    });

    it('freezes the destination on the outbox row', async () => {
      await service.create(input);
      const emailRow = queuedChannels().find((d) => d.channel === 'email');
      expect(emailRow).toMatchObject({
        destination: 'cliente@example.com',
        status: 'pending',
      });
    });

    it('skips a channel with no destination instead of queueing it', async () => {
      // Retrying an address that does not exist would burn every attempt and
      // then report a failure nobody can act on.
      await service.create({ ...input, contact: {} });
      const emailRow = queuedChannels().find((d) => d.channel === 'email');
      expect(emailRow).toMatchObject({ status: 'skipped' });
    });

    it('still queues the in-app row when there is no email', async () => {
      await service.create({ ...input, contact: {} });
      const inappRow = queuedChannels().find((d) => d.channel === 'inapp');
      expect(inappRow).toMatchObject({ status: 'pending' });
    });

    it('leaves disabled channels out entirely', async () => {
      email.isEnabled.mockReturnValue(false);
      await service.create(input);
      expect(queuedChannels().map((d) => d.channel)).toEqual(['inapp']);
    });

    it('is idempotent: a redelivered event creates nothing new', async () => {
      const existing = {
        id: 'notif-1',
        dedupeKey: `payment.received:${ORDER_ID}:${RECIPIENT}`,
      };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.create(input);

      expect(result).toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      // The critical half: the second call must not re-queue deliveries either,
      // or the customer gets the same email twice.
      expect(outboxTxRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('reading', () => {
    it('lists only the caller own notifications', async () => {
      await service.list(RECIPIENT, { page: 1, limit: 25, skip: 0 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientUserId: RECIPIENT } }),
      );
    });

    it('filters to unread when asked', async () => {
      await service.list(RECIPIENT, {
        page: 1,
        limit: 25,
        skip: 0,
        unreadOnly: true,
      });
      const where = findAndCountArg().where;
      expect(where.readAt).toBeDefined();
    });

    it('marks a notification read', async () => {
      repo.findOne.mockResolvedValue({ ...storedRow, readAt: null });
      const result = await service.markRead('notif-1', RECIPIENT);
      expect(result.readAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalled();
    });

    it('does not move the read timestamp on a second read', async () => {
      const alreadyRead = new Date('2026-01-01T00:00:00.000Z');
      repo.findOne.mockResolvedValue({ ...storedRow, readAt: alreadyRead });
      const result = await service.markRead('notif-1', RECIPIENT);
      expect(result.readAt).toBe(alreadyRead);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('answers 404, not 403, for somebody else notification', async () => {
      // The lookup is scoped by recipient, so "absent" and "not yours" are the
      // same answer and the endpoint confirms nothing.
      repo.findOne.mockResolvedValue(null);
      await expect(service.markRead('notif-1', RECIPIENT)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-1', recipientUserId: RECIPIENT },
      });
    });

    it('marks all read scoped to the caller', async () => {
      const result = await service.markAllRead(RECIPIENT);
      expect(result).toEqual({ updated: 3 });
      expect(updateCriteria()).toMatchObject({ recipientUserId: RECIPIENT });
    });

    // The reported bug: the stored link is a snapshot of the routes as they
    // were the day the row was written, and clicking one answered 404.
    it('restates a stale stored link from the current routes', async () => {
      repo.findAndCount.mockResolvedValueOnce([[{ ...storedRow }], 1]);
      const result = await service.list(RECIPIENT, {
        page: 1,
        limit: 25,
        skip: 0,
      });
      expect(result.items[0].link).toBe(`/orders/${ORDER_ID}`);
    });

    it('restates the link when marking one read too', async () => {
      repo.findOne.mockResolvedValue({ ...storedRow });
      const result = await service.markRead('notif-1', RECIPIENT);
      expect(result.link).toBe(`/orders/${ORDER_ID}`);
    });

    it('does not write the recomputed link back to the row', async () => {
      // The entity is mutated only to be serialised. Persisting it here would
      // turn every read into a write.
      repo.findOne.mockResolvedValue({ ...storedRow, readAt: new Date() });
      await service.markRead('notif-1', RECIPIENT);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('survives a row whose event key is no longer in the catalogue', async () => {
      // `event_key` is a plain varchar. One unreadable legacy row must lose its
      // own link, not take the whole feed down with a 500.
      repo.findAndCount.mockResolvedValueOnce([
        [{ ...storedRow, eventKey: 'order.retired_event' }],
        1,
      ]);
      const result = await service.list(RECIPIENT, {
        page: 1,
        limit: 25,
        skip: 0,
      });
      expect(result.items[0].link).toBeNull();
    });
  });
});
