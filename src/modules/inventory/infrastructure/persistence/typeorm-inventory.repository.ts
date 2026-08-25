import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  BulkStockRow,
  BulkUpsertResult,
  ClampedStockRow,
  CreateInventoryInput,
  InventoryFilter,
  InventoryListItem,
  InventoryRepository,
  InventorySummary,
} from '../../application/ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';
import { InventoryNotFoundError } from '../../domain/errors';
import { InventoryEntity } from '../../domain/entities/inventory.entity';

/** 3 bind parameters per row; Postgres caps a statement at 65535. */
const BULK_CHUNK_SIZE = 1000;

interface UpsertReturningRow {
  product_id: number;
  provider_branch_id: string;
  stock: number;
  reserved_stock: number | null;
}

@Injectable()
export class TypeOrmInventoryRepository implements InventoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(filter: InventoryFilter): Promise<InventoryListItem[]> {
    const qb = this.dataSource
      .getRepository(InventoryEntity)
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.product', 'product')
      .orderBy('i.id', 'ASC');

    if (filter.productSku)
      qb.andWhere('product.sku = :sku', { sku: filter.productSku });
    if (filter.providerBranchId !== undefined) {
      qb.andWhere('i.provider_branch_id = :branchId', {
        branchId: filter.providerBranchId,
      });
    }
    if (filter.lowStockThreshold !== undefined) {
      qb.andWhere('(i.stock - i.reserved_stock) <= :threshold', {
        threshold: filter.lowStockThreshold,
      });
    }

    const rows = await qb.getMany();
    return rows.map((r) => this.toListItem(r));
  }

  private toListItem(r: InventoryEntity): InventoryListItem {
    return {
      id: r.id,
      productSku: r.product!.sku,
      providerSku: r.product?.providerSku ?? '',
      providerBranchId: r.providerBranchId,
      stock: r.stock,
      reservedStock: r.reservedStock,
      available: r.stock - r.reservedStock,
      updatedAt: r.updatedAt,
    };
  }

  async findById(id: number): Promise<InventoryListItem | null> {
    const row = await this.dataSource
      .getRepository(InventoryEntity)
      .findOne({ where: { id }, relations: { product: true } });
    if (!row) return null;
    return this.toListItem(row);
  }

  async findBySkuAndBranch(
    productSku: string,
    providerBranchId: number,
  ): Promise<InventoryListItem | null> {
    const row = await this.dataSource
      .getRepository(InventoryEntity)
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.product', 'product')
      .where('product.sku = :productSku', { productSku })
      .andWhere('i.provider_branch_id = :providerBranchId', {
        providerBranchId,
      })
      .getOne();
    return row ? this.toListItem(row) : null;
  }

  async create(input: CreateInventoryInput): Promise<InventoryListItem> {
    try {
      const productId = await this.requireProductId(input.productSku);
      const row = await this.dataSource.getRepository(InventoryEntity).save(
        this.dataSource.getRepository(InventoryEntity).create({
          productId,
          providerBranchId: input.providerBranchId,
          stock: input.stock ?? 0,
          reservedStock: input.reservedStock ?? 0,
        }),
      );
      row.product = {
        id: productId,
        sku: input.productSku,
        providerSku: input.providerSku,
      } as never;
      return this.toListItem(row);
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'inventory row already exists for product_id and branch',
        );
      }
      throw e;
    }
  }

  async summaryBySku(sku: string): Promise<InventorySummary> {
    const row = await this.dataSource
      .getRepository(InventoryEntity)
      .createQueryBuilder('i')
      .innerJoin('i.product', 'product')
      .select('COALESCE(SUM(i.stock), 0)', 'totalStock')
      .addSelect('COALESCE(SUM(i.reserved_stock), 0)', 'totalReserved')
      .addSelect('COUNT(DISTINCT i.provider_branch_id)', 'branches')
      .where('product.sku = :sku', { sku })
      .getRawOne<{
        totalStock: string;
        totalReserved: string;
        branches: string;
      }>();

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
        .leftJoinAndSelect('i.product', 'product')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id })
        .getOne();

      if (!row) throw new InventoryNotFoundError(id);

      const aggregate = Inventory.fromSnapshot({
        id: row.id,
        productSku: row.product!.sku,
        providerSku: row.product?.providerSku ?? '',
        providerBranchId: row.providerBranchId,
        stock: row.stock,
        reservedStock: row.reservedStock,
      });

      const result = mutate(aggregate);
      const snap = aggregate.toSnapshot();

      await tx
        .getRepository(InventoryEntity)
        .update(
          { id: row.id },
          { stock: snap.stock, reservedStock: snap.reservedStock },
        );

      return { inventory: aggregate, result };
    });
  }

  private async requireProductId(sku: string): Promise<number> {
    const rows = await this.dataSource.query<{ id: number }[]>(
      'SELECT id FROM pim.product WHERE sku = $1',
      [sku],
    );
    if (!rows[0]) throw new NotFoundException(`Product sku=${sku} not found`);
    return Number(rows[0].id);
  }
  async findExistingProductSkus(skus: string[]): Promise<Set<string>> {
    if (skus.length === 0) return new Set();

    const rows = await this.dataSource.query<{ sku: string }[]>(
      `SELECT sku FROM pim.product WHERE sku = ANY($1::text[])`,
      [skus],
    );
    return new Set(rows.map((r) => r.sku));
  }

  async bulkUpsertStock(rows: BulkStockRow[]): Promise<BulkUpsertResult> {
    if (rows.length === 0) return { written: 0, clamped: [] };

    const productRows = await this.dataSource.query<
      { id: number; sku: string }[]
    >('SELECT id, sku FROM pim.product WHERE sku = ANY($1::text[])', [
      [...new Set(rows.map((row) => row.productSku))],
    ]);
    const productIdBySku = new Map(
      productRows.map((row) => [row.sku, Number(row.id)]),
    );
    const skuByProductId = new Map(
      productRows.map((row) => [Number(row.id), row.sku]),
    );
    const requested = new Map<string, number>();
    for (const row of rows) {
      const productId = productIdBySku.get(row.productSku);
      if (productId !== undefined)
        requested.set(`${productId} ${row.providerBranchId}`, row.stock);
    }

    const clamped: ClampedStockRow[] = [];
    let written = 0;

    await this.dataSource.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += BULK_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + BULK_CHUNK_SIZE);
        const returned = await this.upsertChunk(tx, chunk);
        written += returned.length;

        for (const row of returned) {
          const productSku = skuByProductId.get(Number(row.product_id))!;
          const providerBranchId = Number(row.provider_branch_id);
          const storedStock = Number(row.stock);
          const reservedStock = Number(row.reserved_stock ?? 0);
          const feedStock = requested.get(
            `${row.product_id} ${providerBranchId}`,
          );

          if (feedStock !== undefined && storedStock > feedStock) {
            clamped.push({
              productSku,
              providerBranchId,
              feedStock,
              storedStock,
              reservedStock,
            });
          }
        }
      }
    });

    return { written, clamped };
  }

  private upsertChunk(
    tx: EntityManager,
    chunk: BulkStockRow[],
  ): Promise<UpsertReturningRow[]> {
    const params: unknown[] = [];
    const tuples = chunk.map((row, index) => {
      const base = index * 3;
      params.push(row.productSku, row.providerBranchId, row.stock);
      return `($${base + 1}::text, $${base + 2}::bigint, $${base + 3}::integer)`;
    });

    // GREATEST keeps the aggregate invariant (reserved_stock <= stock) true even
    // when the supplier reports fewer units than we have already reserved.
    // COALESCE because reserved_stock is nullable in the schema.
    return tx.query(
      `INSERT INTO inventory.inventory AS inv (product_id, provider_branch_id, stock)
       SELECT product.id, source.provider_branch_id, source.stock
       FROM (VALUES ${tuples.join(', ')}) AS source(sku, provider_branch_id, stock)
       JOIN pim.product AS product ON product.sku = source.sku
       ON CONFLICT (product_id, provider_branch_id) DO UPDATE
         SET stock = GREATEST(EXCLUDED.stock, COALESCE(inv.reserved_stock, 0))
       RETURNING product_id, provider_branch_id, stock, reserved_stock`,
      params,
    );
  }

  async zeroOutMissing(
    branchIds: number[],
    keepSkus: string[],
  ): Promise<number> {
    // An empty keep list would zero every row in the branch. Callers are
    // expected to bail out before that, but never make it possible here.
    if (branchIds.length === 0 || keepSkus.length === 0) return 0;

    const rows = await this.dataSource.query<{ id: number }[]>(
      `UPDATE inventory.inventory
          SET stock = COALESCE(reserved_stock, 0)
        WHERE provider_branch_id = ANY($1::bigint[])
          AND stock > COALESCE(reserved_stock, 0)
          AND NOT (product_id = ANY(SELECT id FROM pim.product WHERE sku = ANY($2::text[])))
        RETURNING id`,
      [branchIds, keepSkus],
    );
    return rows.length;
  }
}
