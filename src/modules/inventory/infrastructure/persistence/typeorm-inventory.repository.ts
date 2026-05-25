import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  InventoryFilter,
  InventoryListItem,
  InventoryRepository,
  InventorySummary,
} from '../../application/ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';
import { InventoryNotFoundError } from '../../domain/errors';
import { InventoryEntity } from '../../domain/entities/inventory.entity';

@Injectable()
export class TypeOrmInventoryRepository implements InventoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(filter: InventoryFilter): Promise<InventoryListItem[]> {
    const qb = this.dataSource
      .getRepository(InventoryEntity)
      .createQueryBuilder('i')
      .orderBy('i.id', 'ASC');

    if (filter.productSku) qb.andWhere('i.product_sku = :sku', { sku: filter.productSku });
    if (filter.providerBranchId !== undefined) {
      qb.andWhere('i.provider_branch_id = :branchId', { branchId: filter.providerBranchId });
    }
    if (filter.lowStockThreshold !== undefined) {
      qb.andWhere('(i.stock - i.reserved_stock) <= :threshold', {
        threshold: filter.lowStockThreshold,
      });
    }

    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      productSku: r.productSku,
      providerSku: r.providerSku,
      providerBranchId: r.providerBranchId,
      stock: r.stock,
      reservedStock: r.reservedStock,
      available: r.stock - r.reservedStock,
      updatedAt: r.updatedAt,
    }));
  }

  async summaryBySku(sku: string): Promise<InventorySummary> {
    const row = await this.dataSource
      .getRepository(InventoryEntity)
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.stock), 0)', 'totalStock')
      .addSelect('COALESCE(SUM(i.reserved_stock), 0)', 'totalReserved')
      .addSelect('COUNT(DISTINCT i.provider_branch_id)', 'branches')
      .where('i.product_sku = :sku', { sku })
      .getRawOne<{ totalStock: string; totalReserved: string; branches: string }>();

    const totalStock = Number(row?.totalStock ?? 0);
    const totalReserved = Number(row?.totalReserved ?? 0);
    return {
      productSku: sku,
      totalStock,
      totalReserved,
      totalAvailable: totalStock - totalReserved,
      branches: Number(row?.branches ?? 0),
    };
  }

  async mutate<T>(
    id: number,
    mutate: (inv: Inventory) => T,
  ): Promise<{ inventory: Inventory; result: T }> {
    return this.dataSource.transaction(async (tx) => {
      const row = await tx
        .getRepository(InventoryEntity)
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id })
        .getOne();

      if (!row) throw new InventoryNotFoundError(id);

      const aggregate = Inventory.fromSnapshot({
        id: row.id,
        productSku: row.productSku,
        providerSku: row.providerSku,
        providerBranchId: row.providerBranchId,
        stock: row.stock,
        reservedStock: row.reservedStock,
      });

      const result = mutate(aggregate);
      const snap = aggregate.toSnapshot();

      await tx.getRepository(InventoryEntity).update(
        { id: row.id },
        { stock: snap.stock, reservedStock: snap.reservedStock },
      );

      return { inventory: aggregate, result };
    });
  }
}
