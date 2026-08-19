/** One row of the supplier stock feed, already normalized and de-duplicated. */
export interface FeedStockRow {
  /** Supplier SKU, trimmed. Always a non-empty string. */
  sku: string;
  /** Units available at the Nevada (Sparks) distribution center. Never negative. */
  nvStock: number;
  /** Units available at the Tennessee (Dyersburg) headquarters. Never negative. */
  tnStock: number;
}

export const STOCK_FEED_CLIENT = Symbol('STOCK_FEED_CLIENT');

/**
 * Port for reading a supplier's published stock feed.
 *
 * Implementations must return at most one row per SKU: the upsert downstream
 * uses ON CONFLICT, and Postgres rejects a statement that carries the same
 * conflict key twice.
 */
export interface StockFeedClient {
  fetchStockRows(): Promise<FeedStockRow[]>;
}
