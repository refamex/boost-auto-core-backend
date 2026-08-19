import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import { NOTIFICATION_CHANNELS } from '../ports/notification-channel';
import {
  OUTBOX_MAX_ATTEMPTS,
  OutboxDrainerService,
  backoffMs,
} from './outbox-drainer.service';

function row(
  over: Partial<NotificationOutboxEntity> = {},
): NotificationOutboxEntity {
  return {
    id: 'out-1',
    notificationId: 'notif-1',
    channel: 'email',
    destination: 'cliente@example.com',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(),
    notification: { id: 'notif-1', title: 'Tu pedido ORD-1 fue enviado' },
    ...over,
  } as NotificationOutboxEntity;
}

describe('backoffMs', () => {
  it('grows exponentially with each attempt', () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
  });

  it('caps so a wedged channel does not schedule a retry days out', () => {
    expect(backoffMs(10)).toBe(16 * 60_000);
    expect(backoffMs(99)).toBe(16 * 60_000);
  });
});

describe('OutboxDrainerService', () => {
  const repo = {
    find: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const email = {
    name: 'email',
    isEnabled: jest.fn(() => true),
    resolveDestination: jest.fn(),
    send: jest.fn(),
  };

  // Jest hands mock arguments back as `any`; narrow them once here.
  const findArg = (): { where: Record<string, unknown> } => {
    const calls = repo.find.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][];
    return calls[0][0];
  };

  let service: OutboxDrainerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    email.isEnabled.mockReturnValue(true);
    email.send.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxDrainerService,
        {
          provide: getRepositoryToken(NotificationOutboxEntity),
          useValue: repo,
        },
        { provide: NOTIFICATION_CHANNELS, useValue: [email] },
      ],
    }).compile();
    service = moduleRef.get(OutboxDrainerService);
  });

  it('only picks up rows that are pending and due', async () => {
    repo.find.mockResolvedValue([]);
    await service.drain();
    const where = findArg().where;
    expect(where.status).toBe('pending');
    expect(where.nextAttemptAt).toBeDefined();
  });

  it('sends and marks the row sent', async () => {
    const r = row();
    repo.find.mockResolvedValue([r]);

    const result = await service.drain();

    expect(email.send).toHaveBeenCalled();
    expect(r.status).toBe('sent');
    expect(r.sentAt).toBeInstanceOf(Date);
    expect(r.attempts).toBe(1);
    expect(result.sent).toBe(1);
  });

  it('clears a previous error once a retry succeeds', async () => {
    const r = row({ attempts: 2, lastError: 'timeout' });
    repo.find.mockResolvedValue([r]);
    await service.drain();
    expect(r.lastError).toBeNull();
  });

  it('reschedules with backoff when a send fails', async () => {
    const r = row();
    repo.find.mockResolvedValue([r]);
    email.send.mockRejectedValue(new Error('smtp down'));

    const before = Date.now();
    const result = await service.drain();

    expect(r.status).toBe('pending');
    expect(r.attempts).toBe(1);
    expect(r.lastError).toBe('smtp down');
    expect(r.nextAttemptAt.getTime()).toBeGreaterThan(before);
    expect(result.failed).toBe(0);
  });

  it('gives up after the attempt budget rather than retrying forever', async () => {
    const r = row({ attempts: OUTBOX_MAX_ATTEMPTS - 1 });
    repo.find.mockResolvedValue([r]);
    email.send.mockRejectedValue(new Error('smtp down'));

    const result = await service.drain();

    expect(r.status).toBe('failed');
    expect(r.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(result.failed).toBe(1);
  });

  it('skips a row whose channel is disabled instead of leaving it pending forever', async () => {
    const r = row();
    repo.find.mockResolvedValue([r]);
    email.isEnabled.mockReturnValue(false);

    const result = await service.drain();

    expect(r.status).toBe('skipped');
    expect(email.send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('skips a row for a channel that no longer exists', async () => {
    const r = row({ channel: 'whatsapp' });
    repo.find.mockResolvedValue([r]);

    await service.drain();

    expect(r.status).toBe('skipped');
    expect(r.lastError).toBe('unknown channel');
  });

  it('keeps going after one row throws', async () => {
    // One bad recipient must not strand the rest of the batch.
    const bad = row({ id: 'out-bad' });
    const good = row({ id: 'out-good' });
    repo.find.mockResolvedValue([bad, good]);
    email.send
      .mockRejectedValueOnce(new Error('bounced'))
      .mockResolvedValueOnce(undefined);

    const result = await service.drain();

    expect(bad.status).toBe('pending');
    expect(good.status).toBe('sent');
    expect(result.sent).toBe(1);
  });
});
