import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { NotificationOutboxEntity } from '../../domain/entities/notification-outbox.entity';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from '../ports/notification-channel';

export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 5;

/** 1, 2, 4, 8, 16 minutes. Capped so a wedged channel does not schedule a retry
 * days out and look like the queue silently drained. */
export function backoffMs(attempts: number): number {
  const minutes = Math.min(2 ** Math.max(0, attempts - 1), 16);
  return minutes * 60_000;
}

@Injectable()
export class OutboxDrainerService {
  private readonly logger = new Logger(OutboxDrainerService.name);
  private readonly byName: Map<string, NotificationChannel>;

  constructor(
    @InjectRepository(NotificationOutboxEntity)
    private readonly repo: Repository<NotificationOutboxEntity>,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
  ) {
    this.byName = new Map(channels.map((c) => [c.name, c]));
  }

  /**
   * Sends one batch of due deliveries.
   *
   * Rows are processed one at a time and each records its own outcome, so a
   * channel that throws halfway through never rolls back the ones already sent.
   */
  async drain(): Promise<{ sent: number; failed: number; skipped: number }> {
    const due = await this.repo.find({
      where: { status: 'pending', nextAttemptAt: LessThanOrEqual(new Date()) },
      relations: ['notification'],
      order: { nextAttemptAt: 'ASC' },
      take: OUTBOX_BATCH_SIZE,
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of due) {
      const channel = this.byName.get(row.channel);

      // A row for a channel that no longer exists must not sit pending forever.
      if (!channel || !channel.isEnabled()) {
        row.status = 'skipped';
        row.lastError = channel ? 'channel disabled' : 'unknown channel';
        await this.repo.save(row);
        skipped += 1;
        continue;
      }

      row.attempts += 1;
      try {
        await channel.send(row.notification!, row);
        row.status = 'sent';
        row.sentAt = new Date();
        row.lastError = null;
        sent += 1;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        row.lastError = reason;
        if (row.attempts >= OUTBOX_MAX_ATTEMPTS) {
          row.status = 'failed';
          failed += 1;
          this.logger.error(
            `Delivery ${row.id} via ${row.channel} gave up after ${row.attempts} attempts: ${reason}`,
          );
        } else {
          row.nextAttemptAt = new Date(Date.now() + backoffMs(row.attempts));
          this.logger.warn(
            `Delivery ${row.id} via ${row.channel} failed (attempt ${row.attempts}): ${reason}`,
          );
        }
      }
      await this.repo.save(row);
    }

    return { sent, failed, skipped };
  }
}
