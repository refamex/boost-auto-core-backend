import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AppConfig } from '../../../../shared/config/configuration';
import { RoughCountryStockSyncService } from '../../application/services/rough-country-stock-sync.service';

/**
 * Six fields (the leading one is seconds), so this is 11:00:00 and 15:00:00.
 *
 * Mexico dropped DST in 2022, so America/Mexico_City is a stable UTC-6 — but
 * the zone is kept rather than a fixed offset in case that changes again.
 */
const TWICE_DAILY = '0 0 11,15 * * *';

@Injectable()
export class StockSyncScheduler {
  private readonly logger = new Logger(StockSyncScheduler.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly sync: RoughCountryStockSyncService,
  ) {}

  // Decorator metadata is read at class-definition time, before Nest builds the
  // ConfigService, so the zone has to come from the environment directly. It
  // resolves to the same value Joi defaults ROUGH_COUNTRY_SYNC_TZ to.
  @Cron(TWICE_DAILY, {
    name: 'rough-country-stock-sync',
    timeZone: process.env.ROUGH_COUNTRY_SYNC_TZ ?? 'America/Mexico_City',
  })
  async syncRoughCountryStock(): Promise<void> {
    const { enabled, timeZone } = this.config.get('roughCountry', {
      infer: true,
    });
    if (!enabled) return;

    this.logger.log(
      `Scheduled Rough Country stock sync starting (${timeZone})`,
    );
    try {
      const result = await this.sync.run();
      this.logger.log(
        `Scheduled Rough Country stock sync ended with status=${result.status}`,
      );
    } catch (e) {
      // The service already records its own failures against the import job;
      // this only catches the unexpected so a rejection never escapes the cron.
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(`Scheduled Rough Country stock sync threw: ${reason}`);
    }
  }
}
