import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  InventoryRepository,
} from '../ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';

@Injectable()
export class ReleaseStockUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  async execute(id: number, qty: number): Promise<Inventory> {
    const { inventory } = await this.repo.mutate(id, (inv) => inv.release(qty));
    return inventory;
  }
}
