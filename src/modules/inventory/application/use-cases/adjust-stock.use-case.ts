import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  InventoryRepository,
} from '../ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';

@Injectable()
export class AdjustStockUseCase {
  private readonly logger = new Logger(AdjustStockUseCase.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  async execute(id: number, delta: number, reason: string, actorId?: string): Promise<Inventory> {
    const { inventory } = await this.repo.mutate(id, (inv) => inv.adjust(delta));
    this.logger.log(
      `Inventory ${id} adjusted by ${delta} (reason="${reason}", actor=${actorId ?? 'unknown'}) → stock=${inventory.stock}`,
    );
    return inventory;
  }
}
