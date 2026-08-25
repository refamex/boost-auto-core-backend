import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { TypeOrmInventoryRepository } from '../src/modules/inventory/infrastructure/persistence/typeorm-inventory.repository';
import { describeWithDocker } from './docker-gate';

/**
 * Exercises the raw SQL behind supplier stock imports against a real Postgres.
 *
 * Unit tests mock the repository, so the ON CONFLICT upsert, the GREATEST
 * clamp that protects the aggregate invariant, and the zero-out statement are
 * only ever proven here. Skips locally without Docker; under CI it fails
 * instead (see `docker-gate`).
 */

interface StockRow {
  stock: number;
  reserved_stock: number | null;
}

describeWithDocker('inventory bulk stock SQL', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repo: TypeOrmInventoryRepository;

  /**
   * `inventory.inventory` references products by id, not by sku — `product_sku`
   * was dropped when the schema moved to id references. The port still speaks
   * SKU, so resolve once here and let the assertions keep reading in SKU terms.
   */
  const productIdBySku = new Map<string, number>();

  let nvBranch: number;
  let tnBranch: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/shared/database/migrations/*.ts'],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const provider = await dataSource.query<{ id: number }[]>(
      "INSERT INTO suppliers.provider (name, code_identity) VALUES ('Rough Country', 'RC') RETURNING id",
    );

    const branches = await dataSource.query<{ id: string; city: string }[]>(
      `INSERT INTO suppliers.provider_branch
         (provider_id, branch_name, phone, address, city, postal_code, is_main_branch)
       VALUES ($1, 'Reno DC', '+1', '986 E Greg St', 'Sparks', '89431', FALSE),
              ($1, 'HQ', '+1', '2450 Huish Rd', 'Dyersburg', '38024', TRUE)
       RETURNING id, city`,
      [provider[0].id],
    );

    const sparks = branches.find((b) => b.city === 'Sparks');
    const dyersburg = branches.find((b) => b.city === 'Dyersburg');
    if (!sparks || !dyersburg) throw new Error('branch seed failed');
    nvBranch = Number(sparks.id);
    tnBranch = Number(dyersburg.id);

    const products = await dataSource.query<Array<{ id: number; sku: string }>>(
      `INSERT INTO pim.product (sku, name)
       VALUES ('A1','a'),('A2','b'),('A3','c')
       RETURNING id, sku`,
    );
    for (const row of products) productIdBySku.set(row.sku, Number(row.id));
    // Assert the seed rather than trusting it: a fixture that silently resolved
    // nothing would make every id below `undefined`, and the queries would
    // quietly match zero rows instead of failing here with a readable message.
    expect([...productIdBySku.keys()].sort()).toEqual(['A1', 'A2', 'A3']);

    repo = new TypeOrmInventoryRepository(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM inventory.inventory');
  });

  const productId = (sku: string): number => {
    const id = productIdBySku.get(sku);
    if (id === undefined) throw new Error(`unseeded sku in fixture: ${sku}`);
    return id;
  };

  const stockOf = async (sku: string, branchId: number): Promise<StockRow> => {
    const rows = await dataSource.query<StockRow[]>(
      `SELECT stock, reserved_stock FROM inventory.inventory
        WHERE product_id = $1 AND provider_branch_id = $2`,
      [productId(sku), branchId],
    );
    return rows[0];
  };

  it('keeps only SKUs that exist in pim.product', async () => {
    const found = await repo.findExistingProductSkus(['A1', 'A3', 'GHOST']);
    expect([...found].sort()).toEqual(['A1', 'A3']);
  });

  it('inserts rows that do not exist yet', async () => {
    const result = await repo.bulkUpsertStock([
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: nvBranch,
        stock: 5,
      },
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: tnBranch,
        stock: 9,
      },
    ]);

    expect(result.written).toBe(2);
    expect(result.clamped).toEqual([]);
    expect((await stockOf('A1', nvBranch)).stock).toBe(5);
    expect((await stockOf('A1', tnBranch)).stock).toBe(9);
  });

  it('updates existing rows instead of failing on the unique key', async () => {
    const row = {
      productSku: 'A1',
      providerSku: 'A1',
      providerBranchId: nvBranch,
      stock: 5,
    };
    await repo.bulkUpsertStock([row]);
    await repo.bulkUpsertStock([{ ...row, stock: 12 }]);

    expect((await stockOf('A1', nvBranch)).stock).toBe(12);
    const count = await dataSource.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM inventory.inventory',
    );
    expect(count[0].n).toBe(1);
  });

  it('never lets the feed push stock below reserved, and reports the clamp', async () => {
    await repo.bulkUpsertStock([
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: nvBranch,
        stock: 10,
      },
    ]);
    await dataSource.query(
      'UPDATE inventory.inventory SET reserved_stock = 4 WHERE product_id = $1',
      [productId('A1')],
    );

    const result = await repo.bulkUpsertStock([
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: nvBranch,
        stock: 1,
      },
    ]);

    expect((await stockOf('A1', nvBranch)).stock).toBe(4);
    expect(result.clamped).toEqual([
      {
        productSku: 'A1',
        providerBranchId: nvBranch,
        feedStock: 1,
        storedStock: 4,
        reservedStock: 4,
      },
    ]);
  });

  it('tolerates a NULL reserved_stock', async () => {
    await repo.bulkUpsertStock([
      {
        productSku: 'A2',
        providerSku: 'A2',
        providerBranchId: nvBranch,
        stock: 3,
      },
    ]);
    await dataSource.query(
      'UPDATE inventory.inventory SET reserved_stock = NULL WHERE product_id = $1',
      [productId('A2')],
    );

    await repo.bulkUpsertStock([
      {
        productSku: 'A2',
        providerSku: 'A2',
        providerBranchId: nvBranch,
        stock: 0,
      },
    ]);

    expect((await stockOf('A2', nvBranch)).stock).toBe(0);
  });

  it('zeroes delisted rows down to reserved stock only', async () => {
    await repo.bulkUpsertStock([
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: nvBranch,
        stock: 7,
      },
      {
        productSku: 'A2',
        providerSku: 'A2',
        providerBranchId: nvBranch,
        stock: 8,
      },
      {
        productSku: 'A3',
        providerSku: 'A3',
        providerBranchId: nvBranch,
        stock: 9,
      },
    ]);
    await dataSource.query(
      'UPDATE inventory.inventory SET reserved_stock = 2 WHERE product_id = $1',
      [productId('A3')],
    );

    const affected = await repo.zeroOutMissing([nvBranch, tnBranch], ['A1']);

    expect(affected).toBe(2);
    expect((await stockOf('A1', nvBranch)).stock).toBe(7);
    expect((await stockOf('A2', nvBranch)).stock).toBe(0);
    // Held at the reserved quantity, never below it.
    expect((await stockOf('A3', nvBranch)).stock).toBe(2);
  });

  it('refuses to zero anything when the keep list is empty', async () => {
    await repo.bulkUpsertStock([
      {
        productSku: 'A1',
        providerSku: 'A1',
        providerBranchId: nvBranch,
        stock: 7,
      },
    ]);

    expect(await repo.zeroOutMissing([nvBranch], [])).toBe(0);
    expect((await stockOf('A1', nvBranch)).stock).toBe(7);
  });

  it('writes more rows than fit in a single chunk', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      productSku: ['A1', 'A2', 'A3'][i % 3],
      providerSku: 'x',
      providerBranchId: i % 2 === 0 ? nvBranch : tnBranch,
      stock: 1,
    }));
    // De-duplicated the way the sync service does before calling.
    const unique = [
      ...new Map(
        rows.map((r) => [`${r.productSku} ${r.providerBranchId}`, r]),
      ).values(),
    ];

    const result = await repo.bulkUpsertStock(unique);
    expect(result.written).toBe(unique.length);
  });
});
