import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BulkStockRow,
  INVENTORY_REPOSITORY,
  InventoryRepository,
} from '../../../inventory/application/ports/inventory.repository';
import { ImportJobService } from '../../../integrations/application/services/import-job.service';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  FeedStockRow,
  STOCK_FEED_CLIENT,
  StockFeedClient,
} from '../ports/stock-feed.client';
import { SYNC_LOCK, SyncLock } from '../../../../shared/database/sync-lock';
import { NotificationService } from '../../../notifications/application/services/notification.service';

export const ROUGH_COUNTRY_JOB_TYPE = 'rough-country-stock';
export const ROUGH_COUNTRY_SOURCE_SYSTEM = 'roughcountry-jobber-pc3';

/** Arbitrary but fixed: pg advisory locks are keyed by a bare integer. */
const ADVISORY_LOCK_KEY = 48201001;

/** Job logs go to a JSONB column; keep a long tail out of the row. */
const MAX_LOGGED_ITEMS = 500;

export interface StockSyncRunResult {
  status: 'success' | 'failed' | 'skipped';
  reason?: 'disabled' | 'locked';
  jobId?: string;
  recordsReceived: number;
  recordsProcessed: number;
  recordsFailed: number;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const skipped = (reason: 'disabled' | 'locked'): StockSyncRunResult => ({
  status: 'skipped',
  reason,
  recordsReceived: 0,
  recordsProcessed: 0,
  recordsFailed: 0,
});

/**
 * Pulls Rough Country's published stock feed into inventory.inventory.
 *
 * The feed reports absolute quantities per warehouse, and we model each
 * warehouse as a suppliers.provider_branch row, so a run is: read the feed,
 * drop SKUs we do not carry, write one inventory row per (SKU, branch), and
 * zero anything in those branches the supplier no longer lists.
 */
@Injectable()
export class RoughCountryStockSyncService {
  private readonly logger = new Logger(RoughCountryStockSyncService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(STOCK_FEED_CLIENT) private readonly feed: StockFeedClient,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(SYNC_LOCK) private readonly lock: SyncLock,
    private readonly importJobs: ImportJobService,
    private readonly notifications: NotificationService,
  ) {}

  async run(): Promise<StockSyncRunResult> {
    const settings = this.config.get('roughCountry', { infer: true });

    if (!settings.enabled) {
      this.logger.log('Rough Country stock sync is disabled; skipping run');
      return skipped('disabled');
    }

    const { branchNvId, branchTnId } = settings;
    if (branchNvId === undefined || branchTnId === undefined) {
      // Joi already requires these when the sync is enabled; this is the
      // belt-and-braces guard for a hand-edited environment.
      const errorMsg =
        'Rough Country stock sync is enabled but ROUGH_COUNTRY_BRANCH_NV_ID / _TN_ID are not set';
      this.logger.error(errorMsg);

      // Emit critical notification to system administrators
      await this.emitCriticalAlert('system.stock_sync_config_error', errorMsg);

      return {
        status: 'failed',
        recordsReceived: 0,
        recordsProcessed: 0,
        recordsFailed: 0,
      };
    }

    if (!(await this.lock.tryAcquire(ADVISORY_LOCK_KEY))) {
      this.logger.warn(
        'Another Rough Country stock sync is already running; skipping run',
      );
      return skipped('locked');
    }

    try {
      return await this.execute(branchNvId, branchTnId);
    } finally {
      await this.lock.release(ADVISORY_LOCK_KEY);
    }
  }

  private async execute(
    branchNvId: number,
    branchTnId: number,
  ): Promise<StockSyncRunResult> {
    const job = await this.importJobs.create({
      jobType: ROUGH_COUNTRY_JOB_TYPE,
      sourceSystem: ROUGH_COUNTRY_SOURCE_SYSTEM,
      status: 'running',
      startedAt: new Date(),
    });

    let received = 0;
    let failed = 0;

    try {
      const feedRows = await this.fetchWithRetry(job.id);
      received = feedRows.length;

      // An empty sheet is indistinguishable from "everything went out of
      // stock", and acting on it would zero the whole catalogue. Treat it as a
      // broken feed instead.
      if (received === 0) {
        throw new Error('feed contained no rows; refusing to modify stock');
      }

      const known = await this.inventory.findExistingProductSkus(
        feedRows.map((r) => r.sku),
      );
      const matched = feedRows.filter((r) => known.has(r.sku));
      const unmatched = feedRows
        .filter((r) => !known.has(r.sku))
        .map((r) => r.sku);
      failed = unmatched.length;

      if (matched.length === 0) {
        throw new Error(
          `none of the ${received} feed SKUs exist in pim.product; refusing to modify stock`,
        );
      }

      const rows: BulkStockRow[] = matched.flatMap((row) => [
        {
          productSku: row.sku,
          providerSku: row.sku,
          providerBranchId: branchNvId,
          stock: row.nvStock,
        },
        {
          productSku: row.sku,
          providerSku: row.sku,
          providerBranchId: branchTnId,
          stock: row.tnStock,
        },
      ]);

      const { written, clamped } = await this.inventory.bulkUpsertStock(rows);

      const keepSkus = matched.map((r) => r.sku);
      const zeroed = await this.inventory.zeroOutMissing(
        [branchNvId, branchTnId],
        keepSkus,
      );

      await this.reportUnmatched(job.id, unmatched);
      await this.reportClamped(job.id, clamped);

      await this.importJobs.update(job.id, {
        status: 'success',
        finishedAt: new Date(),
        recordsReceived: received,
        recordsProcessed: written,
        recordsFailed: failed,
      });

      this.logger.log(
        `Rough Country stock sync finished: ${written} rows written, ${zeroed} delisted rows zeroed, ` +
          `${failed} SKUs without a product, ${clamped.length} clamped to reserved stock`,
      );

      return {
        status: 'success',
        jobId: job.id,
        recordsReceived: received,
        recordsProcessed: written,
        recordsFailed: failed,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(`Rough Country stock sync failed: ${reason}`);

      // Emit critical notification to system administrators
      await this.emitCriticalAlert('system.stock_sync_failed', reason);

      await this.importJobs.addLog(job.id, { level: 'error', message: reason });
      await this.importJobs.update(job.id, {
        status: 'failed',
        finishedAt: new Date(),
        recordsReceived: received,
        recordsProcessed: 0,
        recordsFailed: failed,
      });

      return {
        status: 'failed',
        jobId: job.id,
        recordsReceived: received,
        recordsProcessed: 0,
        recordsFailed: failed,
      };
    }
  }

  /**
   * Reads the feed, retrying a supplier that is merely unreachable.
   *
   * Scoped deliberately to the fetch. The rest of `execute` writes stock, and
   * re-running it would re-apply writes that already landed. `ServiceUnavailable`
   * is the only retried failure because it is the only one the feed client
   * raises for transport — an unusable workbook, an empty sheet or a feed whose
   * SKUs we do not carry are all stable answers, and asking three times pulls a
   * ~16 MB workbook three times to reach the same conclusion.
   */
  private async fetchWithRetry(jobId: string): Promise<FeedStockRow[]> {
    const { retryAttempts, retryBaseDelayMs } = this.config.get('roughCountry', {
      infer: true,
    });

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.feed.fetchStockRows();
      } catch (e) {
        const isLast = attempt >= retryAttempts;
        if (!(e instanceof ServiceUnavailableException) || isLast) throw e;

        const reason = e instanceof Error ? e.message : String(e);
        const waitMs = retryBaseDelayMs * 2 ** (attempt - 1);

        this.logger.warn(
          `Rough Country feed unreachable (attempt ${attempt}/${retryAttempts}): ${reason}; ` +
            `retrying in ${waitMs}ms`,
        );
        await this.importJobs.addLog(jobId, {
          level: 'warn',
          message: `feed unreachable on attempt ${attempt} of ${retryAttempts}; retrying in ${waitMs}ms`,
          payloadJson: { attempt, maxAttempts: retryAttempts, waitMs, reason },
        });

        await sleep(waitMs);
      }
    }
  }

  private async reportUnmatched(
    jobId: string,
    unmatched: string[],
  ): Promise<void> {
    if (unmatched.length === 0) return;
    await this.importJobs.addLog(jobId, {
      level: 'warn',
      message: `${unmatched.length} feed SKUs have no matching pim.product row and were skipped`,
      payloadJson: {
        unmatchedCount: unmatched.length,
        unmatchedSkus: unmatched.slice(0, MAX_LOGGED_ITEMS),
        truncated: unmatched.length > MAX_LOGGED_ITEMS,
      },
    });
  }

  private async reportClamped(
    jobId: string,
    clamped: {
      productSku: string;
      providerBranchId: number;
      reservedStock: number;
    }[],
  ): Promise<void> {
    if (clamped.length === 0) return;
    await this.importJobs.addLog(jobId, {
      level: 'warn',
      message:
        `${clamped.length} rows reported less stock than we already have reserved; ` +
        'stock was held at the reserved quantity',
      payloadJson: {
        clampedCount: clamped.length,
        clampedRows: clamped.slice(0, MAX_LOGGED_ITEMS),
        truncated: clamped.length > MAX_LOGGED_ITEMS,
      },
    });
  }

  /**
   * Emits a critical system alert to administrators.
   * Uses a special system user ID so admins can subscribe to these notifications.
   */
  private async emitCriticalAlert(
    eventKey: 'system.stock_sync_config_error' | 'system.stock_sync_failed',
    message: string,
  ): Promise<void> {
    try {
      // System notifications use a reserved UUID for admin routing
      const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
      await this.notifications.create({
        eventKey,
        recipientUserId: SYSTEM_USER_ID,
        entityType: 'stock_sync_job',
        entityId: ROUGH_COUNTRY_JOB_TYPE,
        context: {
          reference: message, // Error message goes in the reference field
        },
      });
    } catch (notifError) {
      // Don't let notification failures block the sync result
      this.logger.warn(
        `Failed to emit critical alert notification: ${notifError}`,
      );
    }
  }
}
