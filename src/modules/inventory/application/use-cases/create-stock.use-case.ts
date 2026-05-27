import { Inject, Injectable } from '@nestjs/common';
import { InventoryNotFoundError } from '../../domain/errors';
import {
  CreateInventoryInput,
  INVENTORY_REPOSITORY,
  InventoryListItem,
  InventoryRepository,
} from '../ports/inventory.repository';

@Injectable()
export class CreateStockUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  execute(input: CreateInventoryInput): Promise<InventoryListItem> {
    return this.repo.create(input);
  }
}

@Injectable()
export class GetStockByIdUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: InventoryRepository,
  ) {}

  async execute(id: number): Promise<InventoryListItem> {
    const row = await this.repo.findById(id);
    if (!row) throw new InventoryNotFoundError(id);
    return row;
  }
}
