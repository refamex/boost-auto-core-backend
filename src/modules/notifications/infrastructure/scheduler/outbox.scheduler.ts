import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SYNC_LOCK, SyncLock } from '../../../../shared/database/sync-lock';
import { OutboxDrainerService } from '../../application/services/outbox-drainer.service';

/** Distinct from stock-sync's 48201001 — two jobs sharing a key would block each other. */
const ADVISORY_LOCK_KEY = 48201002;

/** Six fields, so: every minute on the minute. */
const EVERY_MINUTE = '0 * * * * *';

@Injectable()
export class OutboxScheduler {
  private readonly logger = new Logger(OutboxScheduler.name);

  constructor(
    private readonly drainer: OutboxDrainerService,
    @Inject(SYNC_LOCK) private readonly lock: SyncLock,
  ) {}

  @Cron(EVERY_MINUTE, { name: 'notifications-outbox-drain' })
  async drainOutbox(): Promise<void> {
    // The cron fires on every replica; without the lock they would all pick up
    // the same pending rows and send duplicates.
    const acquired = await this.lock.tryAcquire(ADVISORY_LOCK_KEY);
    if (!acquired) return;

    try {
      const result = await this.drainer.drain();
      if (result.sent || result.failed || result.skipped) {
        this.logger.log(
          `Outbox drained: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    } catch (e) {
      // Never let a rejection escape the cron; the rows stay pending and the
      // next tick retries them.
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(`Outbox drain threw: ${reason}`);
    } finally {
      await this.lock.release(ADVISORY_LOCK_KEY);
    }
  }
}
