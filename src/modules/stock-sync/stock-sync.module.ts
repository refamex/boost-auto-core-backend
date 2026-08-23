import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { InventoryModule } from '../inventory/inventory.module';
import { STOCK_FEED_CLIENT } from './application/ports/stock-feed.client';
import { SYNC_LOCK } from '../../shared/database/sync-lock';
import { RoughCountryStockSyncService } from './application/services/rough-country-stock-sync.service';
import { RoughCountryXlsxFeedClient } from './infrastructure/feed/rough-country-xlsx-feed.client';
import { StockSyncController } from './infrastructure/http/stock-sync.controller';
import { PostgresSyncLock } from '../../shared/database/postgres-sync.lock';
import { StockSyncScheduler } from './infrastructure/scheduler/stock-sync.scheduler';

/**
 * Scheduled import of supplier stock feeds.
 *
 * Consumes InventoryModule's repository port for the bulk write and
 * IntegrationsModule's ImportJobService so every run is recorded in
 * integrations.import_jobs with its own logs.
 */
@Module({
  imports: [InventoryModule, IntegrationsModule],
  providers: [
    RoughCountryStockSyncService,
    StockSyncScheduler,
    { provide: STOCK_FEED_CLIENT, useClass: RoughCountryXlsxFeedClient },
    { provide: SYNC_LOCK, useClass: PostgresSyncLock },
  ],
  controllers: [StockSyncController],
})
export class StockSyncModule {}
