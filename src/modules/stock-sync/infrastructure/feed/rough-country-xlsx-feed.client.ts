import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  FeedStockRow,
  StockFeedClient,
} from '../../application/ports/stock-feed.client';
import {
  SheetRow,
  XlsxParseError,
  parseFirstSheet,
} from './xlsx-stock-sheet.parser';

/** Generous: the published workbook is ~16 MB. */
const FEED_TIMEOUT_MS = 180_000;

const SKU_HEADER = 'sku';
const NV_HEADER = 'nv_stock';
const TN_HEADER = 'tn_stock';

/** Anything the supplier cannot express as a non-negative whole number means "none". */
const toQuantity = (raw: string | undefined): number => {
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

/**
 * Reads Rough Country's jobber feed: an xlsx whose first sheet ("General")
 * carries one row per SKU with per-warehouse quantities.
 */
@Injectable()
export class RoughCountryXlsxFeedClient implements StockFeedClient {
  private readonly logger = new Logger(RoughCountryXlsxFeedClient.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async fetchStockRows(): Promise<FeedStockRow[]> {
    const buffer = await this.download();

    let sheetRows: SheetRow[];
    try {
      sheetRows = parseFirstSheet(buffer, [SKU_HEADER, NV_HEADER, TN_HEADER]);
    } catch (e) {
      if (e instanceof XlsxParseError) {
        this.logger.error(
          `Rough Country feed could not be parsed: ${e.message}`,
        );
        throw new ServiceUnavailableException(
          `Rough Country stock feed is unusable: ${e.message}`,
        );
      }
      throw e;
    }

    // Keyed by SKU: the feed ships a few exact duplicate rows, and a single
    // ON CONFLICT statement cannot touch the same conflict key twice.
    const bySku = new Map<string, FeedStockRow>();
    let skippedWithoutSku = 0;

    for (const row of sheetRows) {
      const sku = (row.cells.get(SKU_HEADER) ?? '').trim();
      if (sku === '') {
        skippedWithoutSku += 1;
        continue;
      }
      bySku.set(sku, {
        sku,
        nvStock: toQuantity(row.cells.get(NV_HEADER)),
        tnStock: toQuantity(row.cells.get(TN_HEADER)),
      });
    }

    const rows = [...bySku.values()];
    this.logger.log(
      `Rough Country feed parsed: ${rows.length} unique SKUs from ${sheetRows.length} rows` +
        (skippedWithoutSku > 0 ? ` (${skippedWithoutSku} without a SKU)` : ''),
    );
    return rows;
  }

  private async download(): Promise<Uint8Array> {
    const { feedUrl } = this.config.get('roughCountry', { infer: true });

    let response: Response;
    try {
      response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(`Rough Country feed download failed: ${reason}`);
      throw new ServiceUnavailableException(
        'Rough Country stock feed is unreachable',
      );
    }

    if (!response.ok) {
      this.logger.error(`Rough Country feed responded ${response.status}`);
      throw new ServiceUnavailableException(
        `Rough Country stock feed responded ${response.status}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
