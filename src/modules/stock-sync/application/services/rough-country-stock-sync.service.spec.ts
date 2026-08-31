import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  BulkStockRow,
  INVENTORY_REPOSITORY,
} from '../../../inventory/application/ports/inventory.repository';
import { ImportJobService } from '../../../integrations/application/services/import-job.service';
import { STOCK_FEED_CLIENT } from '../ports/stock-feed.client';
import { SYNC_LOCK } from '../../../../shared/database/sync-lock';
import {
  ROUGH_COUNTRY_JOB_TYPE,
  ROUGH_COUNTRY_SOURCE_SYSTEM,
  RoughCountryStockSyncService,
} from './rough-country-stock-sync.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';

const NV_BRANCH = 2;
const TN_BRANCH = 1;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

interface LoggedPayload {
  level?: string;
  message: string;
  payloadJson?: Record<string, unknown>;
}
type LogCall = [string, LoggedPayload];

describe('RoughCountryStockSyncService', () => {
  const feedClient = { fetchStockRows: jest.fn() };

  const inventoryRepo = {
    findExistingProductSkus: jest.fn(),
    bulkUpsertStock: jest.fn(),
    zeroOutMissing: jest.fn(),
  };

  const importJobs = {
    create: jest.fn(),
    update: jest.fn(),
    addLog: jest.fn(),
  };

  const lock = { tryAcquire: jest.fn(), release: jest.fn() };

  const config = { get: jest.fn() };

  const notifications = { create: jest.fn() };

  let service: RoughCountryStockSyncService;

  const findLog = (payloadKey: string): LogCall | undefined =>
    (importJobs.addLog.mock.calls as LogCall[]).find(
      ([, dto]) => dto.payloadJson?.[payloadKey] !== undefined,
    );

  const configureSync = (overrides: Record<string, unknown> = {}) => {
    config.get.mockReturnValue({
      enabled: true,
      feedUrl: 'https://example.test/feed.xlsx',
      branchNvId: NV_BRANCH,
      branchTnId: TN_BRANCH,
      timeZone: 'America/Mexico_City',
      retryAttempts: 3,
      // Zero so the suite exercises the retry loop without waiting on it.
      retryBaseDelayMs: 0,
      ...overrides,
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configureSync();
    lock.tryAcquire.mockResolvedValue(true);
    lock.release.mockResolvedValue(undefined);
    importJobs.create.mockResolvedValue({ id: 'job-1' });
    importJobs.update.mockResolvedValue({ id: 'job-1' });
    importJobs.addLog.mockResolvedValue({ id: 'log-1' });
    inventoryRepo.bulkUpsertStock.mockResolvedValue({
      written: 0,
      clamped: [],
    });
    inventoryRepo.zeroOutMissing.mockResolvedValue(0);
    feedClient.fetchStockRows.mockResolvedValue([]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set<string>());

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoughCountryStockSyncService,
        { provide: ConfigService, useValue: config },
        { provide: STOCK_FEED_CLIENT, useValue: feedClient },
        { provide: INVENTORY_REPOSITORY, useValue: inventoryRepo },
        { provide: ImportJobService, useValue: importJobs },
        { provide: SYNC_LOCK, useValue: lock },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(RoughCountryStockSyncService);
  });

  it('writes one row per branch for every SKU that exists in the catalog', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'ABC', nvStock: 5, tnStock: 9 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));
    inventoryRepo.bulkUpsertStock.mockResolvedValue({
      written: 2,
      clamped: [],
    });

    const result = await service.run();

    expect(inventoryRepo.bulkUpsertStock).toHaveBeenCalledWith([
      {
        productSku: 'ABC',
        providerSku: 'ABC',
        providerBranchId: NV_BRANCH,
        stock: 5,
      },
      {
        productSku: 'ABC',
        providerSku: 'ABC',
        providerBranchId: TN_BRANCH,
        stock: 9,
      },
    ]);
    expect(result.status).toBe('success');
    expect(result.recordsReceived).toBe(1);
    expect(result.recordsProcessed).toBe(2);
    expect(result.recordsFailed).toBe(0);
  });

  it('skips SKUs missing from pim.product and reports them', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'KNOWN', nvStock: 1, tnStock: 2 },
      { sku: 'GHOST', nvStock: 3, tnStock: 4 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['KNOWN']));
    inventoryRepo.bulkUpsertStock.mockResolvedValue({
      written: 2,
      clamped: [],
    });

    const result = await service.run();

    const upsertCalls = inventoryRepo.bulkUpsertStock.mock
      .calls as BulkStockRow[][][];
    expect(upsertCalls[0][0].map((r) => r.productSku)).toEqual([
      'KNOWN',
      'KNOWN',
    ]);
    expect(result.recordsFailed).toBe(1);

    const unmatchedLog = findLog('unmatchedSkus');
    expect(unmatchedLog).toBeDefined();
    expect(unmatchedLog?.[1].level).toBe('warn');
    expect(unmatchedLog?.[1].payloadJson?.unmatchedSkus).toContain('GHOST');
    expect(unmatchedLog?.[1].payloadJson?.unmatchedCount).toBe(1);
  });

  it('zeroes branch rows whose SKU is no longer listed in the feed', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'STILL', nvStock: 1, tnStock: 1 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['STILL']));
    inventoryRepo.zeroOutMissing.mockResolvedValue(7);

    await service.run();

    expect(inventoryRepo.zeroOutMissing).toHaveBeenCalledWith(
      [NV_BRANCH, TN_BRANCH],
      ['STILL'],
    );
  });

  it('reports rows whose feed quantity was clamped up to reserved stock', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'ABC', nvStock: 0, tnStock: 0 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));
    inventoryRepo.bulkUpsertStock.mockResolvedValue({
      written: 2,
      clamped: [
        {
          productSku: 'ABC',
          providerBranchId: NV_BRANCH,
          feedStock: 0,
          storedStock: 3,
          reservedStock: 3,
        },
      ],
    });

    await service.run();

    const clampLog = findLog('clampedRows');
    expect(clampLog).toBeDefined();
    expect(clampLog?.[1].level).toBe('warn');
    expect(clampLog?.[1].payloadJson?.clampedCount).toBe(1);
  });

  it('does nothing when the integration is disabled', async () => {
    configureSync({ enabled: false });

    const result = await service.run();

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('disabled');
    expect(importJobs.create).not.toHaveBeenCalled();
    expect(feedClient.fetchStockRows).not.toHaveBeenCalled();
  });

  it('does nothing when another instance already holds the lock', async () => {
    lock.tryAcquire.mockResolvedValue(false);

    const result = await service.run();

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('locked');
    expect(importJobs.create).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('marks the job failed and releases the lock when the feed download fails', async () => {
    feedClient.fetchStockRows.mockRejectedValue(new Error('feed unreachable'));

    const result = await service.run();

    expect(result.status).toBe('failed');
    expect(importJobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'failed' }),
    );
    expect(importJobs.addLog).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ level: 'error' }),
    );
    expect(lock.release).toHaveBeenCalled();
  });

  describe('UC-06 FA-1: retrying an unreachable supplier', () => {
    const unreachable = () =>
      new ServiceUnavailableException(
        'Rough Country stock feed is unreachable',
      );

    it('retries the fetch and completes the run when a later attempt succeeds', async () => {
      feedClient.fetchStockRows
        .mockRejectedValueOnce(unreachable())
        .mockResolvedValueOnce([{ sku: 'ABC', nvStock: 4, tnStock: 2 }]);
      inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));

      const result = await service.run();

      expect(result.status).toBe('success');
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(2);
      expect(inventoryRepo.bulkUpsertStock).toHaveBeenCalled();
    });

    it('gives up after the configured number of attempts and alerts', async () => {
      feedClient.fetchStockRows.mockRejectedValue(unreachable());

      const result = await service.run();

      expect(result.status).toBe('failed');
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(3);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: 'system.stock_sync_failed' }),
      );
      expect(lock.release).toHaveBeenCalled();
    });

    it('records every retry against the import job with a doubling wait', async () => {
      configureSync({ retryBaseDelayMs: 0, retryAttempts: 3 });
      feedClient.fetchStockRows.mockRejectedValue(unreachable());

      await service.run();

      const retries = (importJobs.addLog.mock.calls as LogCall[]).filter(
        ([, dto]) => dto.payloadJson?.attempt !== undefined,
      );
      expect(retries).toHaveLength(2);
      expect(retries.map(([, dto]) => dto.payloadJson?.attempt)).toEqual([
        1, 2,
      ]);
    });

    it('doubles the wait between attempts', async () => {
      configureSync({ retryBaseDelayMs: 50, retryAttempts: 3 });
      feedClient.fetchStockRows.mockRejectedValue(unreachable());

      await service.run();

      const waits = (importJobs.addLog.mock.calls as LogCall[])
        .filter(([, dto]) => dto.payloadJson?.waitMs !== undefined)
        .map(([, dto]) => dto.payloadJson?.waitMs);
      expect(waits).toEqual([50, 100]);
    });

    it('does not retry a feed that answers with no rows', async () => {
      feedClient.fetchStockRows.mockResolvedValue([]);

      const result = await service.run();

      expect(result.status).toBe('failed');
      // An empty sheet is a stable answer, not a transport failure: asking
      // twice pulls a ~16 MB workbook twice to reach the same conclusion.
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(1);
    });

    it('does not retry a feed whose SKUs are all unknown', async () => {
      feedClient.fetchStockRows.mockResolvedValue([
        { sku: 'GHOST', nvStock: 1, tnStock: 1 },
      ]);
      inventoryRepo.findExistingProductSkus.mockResolvedValue(
        new Set<string>(),
      );

      const result = await service.run();

      expect(result.status).toBe('failed');
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(1);
    });

    it('does not retry a failure that is not a transport failure', async () => {
      feedClient.fetchStockRows.mockRejectedValue(new Error('bad workbook'));

      const result = await service.run();

      expect(result.status).toBe('failed');
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(1);
    });

    it('never retries the write path', async () => {
      feedClient.fetchStockRows.mockResolvedValue([
        { sku: 'ABC', nvStock: 1, tnStock: 1 },
      ]);
      inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));
      inventoryRepo.bulkUpsertStock.mockRejectedValue(
        new ServiceUnavailableException('database is away'),
      );

      const result = await service.run();

      expect(result.status).toBe('failed');
      // Retrying here would re-apply writes that already landed.
      expect(inventoryRepo.bulkUpsertStock).toHaveBeenCalledTimes(1);
      expect(feedClient.fetchStockRows).toHaveBeenCalledTimes(1);
    });
  });

  it('releases the lock after a successful run', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'ABC', nvStock: 1, tnStock: 1 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));

    await service.run();

    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('refuses to touch stock when the feed comes back empty', async () => {
    feedClient.fetchStockRows.mockResolvedValue([]);

    const result = await service.run();

    expect(result.status).toBe('failed');
    expect(inventoryRepo.bulkUpsertStock).not.toHaveBeenCalled();
    expect(inventoryRepo.zeroOutMissing).not.toHaveBeenCalled();
  });

  it('refuses to touch stock when no feed SKU matches the catalog', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'GHOST', nvStock: 1, tnStock: 1 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set<string>());

    const result = await service.run();

    expect(result.status).toBe('failed');
    expect(inventoryRepo.zeroOutMissing).not.toHaveBeenCalled();
  });

  it('records the run against the import job with source metadata', async () => {
    feedClient.fetchStockRows.mockResolvedValue([
      { sku: 'ABC', nvStock: 1, tnStock: 1 },
    ]);
    inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));

    await service.run();

    expect(importJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: ROUGH_COUNTRY_JOB_TYPE,
        sourceSystem: ROUGH_COUNTRY_SOURCE_SYSTEM,
        status: 'running',
      }),
    );
    expect(importJobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: 'success',
        finishedAt: expect.any(Date) as Date,
      }),
    );
  });

  it('fails fast when the branch ids are not configured', async () => {
    configureSync({ branchNvId: undefined });

    const result = await service.run();

    expect(result.status).toBe('failed');
    expect(feedClient.fetchStockRows).not.toHaveBeenCalled();
    // Phase 5: Should emit critical notification to admins
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'system.stock_sync_config_error',
        recipientUserId: SYSTEM_USER_ID,
        entityType: 'stock_sync_job',
        entityId: ROUGH_COUNTRY_JOB_TYPE,
      }),
    );
  });

  describe('Phase 5: Critical Admin Notifications', () => {
    it('emits notification when both branch IDs are missing', async () => {
      configureSync({ branchNvId: undefined, branchTnId: undefined });

      await service.run();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: 'system.stock_sync_config_error',
          recipientUserId: SYSTEM_USER_ID,
        }),
      );
    });

    it('emits notification when sync fails due to feed error', async () => {
      feedClient.fetchStockRows.mockRejectedValue(
        new Error('Failed to download XLSX'),
      );

      await service.run();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: 'system.stock_sync_failed',
          recipientUserId: SYSTEM_USER_ID,
          context: {
            reference: 'Failed to download XLSX',
          },
        }),
      );
    });

    it('emits notification when feed is empty', async () => {
      feedClient.fetchStockRows.mockResolvedValue([]);

      await service.run();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: 'system.stock_sync_failed',
          context: {
            // `expect.stringContaining` is typed `any`; the cast keeps the
            // matcher intact while satisfying no-unsafe-assignment.
            reference: expect.stringContaining(
              'feed contained no rows',
            ) as string,
          },
        }),
      );
    });

    it('emits notification when no SKUs match products', async () => {
      feedClient.fetchStockRows.mockResolvedValue([
        { sku: 'UNKNOWN', nvStock: 1, tnStock: 1 },
      ]);
      inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set());

      await service.run();

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: 'system.stock_sync_failed',
          context: {
            reference: expect.stringContaining('none of the') as string,
          },
        }),
      );
    });

    it('does not emit notification when sync succeeds', async () => {
      feedClient.fetchStockRows.mockResolvedValue([
        { sku: 'ABC', nvStock: 1, tnStock: 1 },
      ]);
      inventoryRepo.findExistingProductSkus.mockResolvedValue(new Set(['ABC']));
      inventoryRepo.bulkUpsertStock.mockResolvedValue({
        written: 2,
        clamped: [],
      });

      await service.run();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not emit notification when sync is disabled', async () => {
      configureSync({ enabled: false });

      await service.run();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not emit notification when sync is locked', async () => {
      lock.tryAcquire.mockResolvedValue(false);

      await service.run();

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('continues with sync result if notification fails', async () => {
      configureSync({ branchNvId: undefined });
      notifications.create.mockRejectedValue(
        new Error('Notification service down'),
      );

      const result = await service.run();

      // Should still return failed status despite notification error
      expect(result.status).toBe('failed');
    });
  });
});
