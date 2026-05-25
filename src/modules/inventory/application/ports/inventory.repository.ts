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
export interface InventoryRepository {
  list(filter: InventoryFilter): Promise<InventoryListItem[]>;
  summaryBySku(sku: string): Promise<InventorySummary>;
  /**
   * Loads an inventory row with a row-level lock, applies the mutation,
   * then persists the new state — all in a single transaction.
   */
  mutate<T>(id: number, mutate: (inv: Inventory) => T): Promise<{ inventory: Inventory; result: T }>;
}
