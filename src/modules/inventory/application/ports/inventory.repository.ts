import { Inventory } from '../../domain/inventory.aggregate';

export interface InventoryFilter {
  productSku?: string;
  providerBranchId?: number;
  lowStockThreshold?: number;
}

export interface InventoryListItem {
  id: number;
  productSku: string;
  providerSku: string;
  providerBranchId: number;
  stock: number;
  reservedStock: number;
  available: number;
  updatedAt: Date;
}

export interface InventorySummary {
  productSku: string;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  branches: number;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

/**
 * Port for inventory persistence. Implementations must wrap mutating
 * operations in a transaction and acquire row-level locks (SELECT ... FOR
 * UPDATE) so concurrent reserve/release/adjust operations are serialized.
 */
export interface CreateInventoryInput {
  productSku: string;
  providerSku: string;
  providerBranchId: number;
  stock?: number;
  reservedStock?: number;
}

/** One absolute stock reading coming from a supplier feed. */
export interface BulkStockRow {
  productSku: string;
  providerSku: string;
  providerBranchId: number;
  /** Absolute quantity reported by the supplier. Never negative. */
  stock: number;
}

/**
 * A row whose feed quantity was below what we already have reserved, so the
 * write was raised to `reservedStock` to keep the aggregate invariant intact.
 */
export interface ClampedStockRow {
  productSku: string;
  providerBranchId: number;
  /** What the supplier reported. */
  feedStock: number;
  /** What we actually stored (equal to reservedStock). */
  storedStock: number;
  reservedStock: number;
}

export interface BulkUpsertResult {
  /** Rows inserted or updated. */
  written: number;
  clamped: ClampedStockRow[];
}

export interface InventoryRepository {
  list(filter: InventoryFilter): Promise<InventoryListItem[]>;
  findById(id: number): Promise<InventoryListItem | null>;
  summaryBySku(sku: string): Promise<InventorySummary>;
  create(input: CreateInventoryInput): Promise<InventoryListItem>;
  findBySkuAndBranch(
    productSku: string,
    providerBranchId: number,
  ): Promise<InventoryListItem | null>;
  /**
   * Loads an inventory row with a row-level lock, applies the mutation,
   * then persists the new state — all in a single transaction.
   */
  mutate<T>(
    id: number,
    mutate: (inv: Inventory) => T,
  ): Promise<{ inventory: Inventory; result: T }>;

  /**
   * Filters a list of SKUs down to those that exist in pim.product.
   *
   * inventory.product_sku is an FK to pim.product(sku) with ON DELETE RESTRICT,
   * so unknown SKUs must be dropped before any insert is attempted.
   */
  findExistingProductSkus(skus: string[]): Promise<Set<string>>;

  /**
   * Bulk absolute-stock write for supplier feed synchronisation.
   *
   * This is the one place allowed to write `stock` without going through the
   * Inventory aggregate (see CLAUDE.md): a feed run touches tens of thousands
   * of rows and cannot afford one locked transaction each. The invariant the
   * aggregate protects — `reserved_stock <= stock` — is instead enforced in
   * SQL via GREATEST, so no row can be written into a state that would make
   * `Inventory.fromSnapshot` throw. Every single-row path still goes through
   * the aggregate.
   *
   * Callers must de-duplicate by (productSku, providerBranchId) first.
   */
  bulkUpsertStock(rows: BulkStockRow[]): Promise<BulkUpsertResult>;

  /**
   * Zeroes the stock of rows in the given branches whose SKU is absent from
   * `keepSkus` — i.e. the supplier no longer lists them. Stock is lowered to
   * `reserved_stock` rather than to 0 so the aggregate invariant holds.
   *
   * Returns the number of rows affected.
   */
  zeroOutMissing(branchIds: number[], keepSkus: string[]): Promise<number>;
}
