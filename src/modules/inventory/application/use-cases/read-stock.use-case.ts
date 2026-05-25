import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  InventoryFilter,
  InventoryListItem,
  InventoryRepository,
  InventorySummary,
} from '../ports/inventory.repository';

@Injectable()
export class ListStockUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  execute(filter: InventoryFilter): Promise<InventoryListItem[]> {
    return this.repo.list(filter);
  }
}

@Injectable()
export class SummaryBySkuUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  execute(sku: string): Promise<InventorySummary> {
    return this.repo.summaryBySku(sku);
  }
}
