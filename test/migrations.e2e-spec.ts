import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

/**
 * Proves the migration chain runs on a database that has never seen it.
 *
 * That path had no coverage at all, which is how `fdcc5ee` shipped an
 * `InitialSchema` whose `CREATE INDEX` statements referenced columns its own
 * `CREATE TABLE` statements no longer created. A fresh database died mid-chain
 * and could not boot the service; every existing environment was already
 * migrated, so nobody hit it.
 *
 * It lives in its own file on purpose. The failure DOES surface today inside
 * `inventory-bulk-stock.e2e-spec.ts`'s `beforeAll`, but that spec is
 * independently stale — it queries `inventory.inventory.product_sku`, a column
 * the id migration removed — so the failure reads as "that suite is broken"
 * rather than "the schema is broken". Isolation is the whole point.
 *
 * NOTE: like every e2e here, this skips without Docker. That skip is itself
 * part of why the defect survived, so treat a skipped run as NO evidence, not
 * as a pass.
 */

const hasDocker = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const describeWithDocker = hasDocker() ? describe : describe.skip;

/** Every index the id migration destroyed, restored by the repair migration. */
const RESTORED_INDEXES = [
  'idx_compat_motorization_id',
  'idx_compat_plant_id',
  'idx_compat_vehicle_lookup',
  'idx_compat_year_id',
  'idx_inventory_product_branch',
  'idx_inventory_product_id',
  'idx_inventory_stock',
  'idx_mcm_motorization_model',
  'idx_model_car_plant_id',
  'idx_products_image_product',
  'idx_pxref_product_id',
  'idx_pxref_reference_id',
];

/** The code-based names the id migration dropped. None may come back. */
const DEAD_INDEXES = [
  'idx_compat_model_code',
  'idx_compat_model_year',
  'idx_compat_motorization_code',
  'idx_compat_plant_code',
  'idx_compat_sku',
  'idx_compat_sku_filters_code',
  'idx_compat_year_code',
  'idx_mcm_composite',
  'idx_mcm_model_car_code',
  'idx_mcm_motorization_code',
  'idx_model_car_code_plant',
  'idx_pxref_reference_sku',
];

/** The migration under test, by identity — `undoLastMigration` is positional. */
const REPAIR_MIGRATION = 'RestoreIdBasedIndexes1787788800000';

describeWithDocker('migration chain', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  const buildDataSource = (): DataSource =>
    new DataSource({
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

  /**
   * Snapshots DEFINITIONS, not names. A name comparison is satisfied by an
   * index that exists with the right name and the wrong shape, which is
   * exactly what a silently-edited repair statement would produce.
   */
  const indexDefs = async (): Promise<Array<[string, string]>> => {
    const rows = await dataSource.query<
      Array<{ indexname: string; indexdef: string }>
    >(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname IN ('compatibility','vehicles','pim','inventory')
        ORDER BY indexname`,
    );
    return rows.map((r) => [r.indexname, r.indexdef]);
  };

  const indexNames = async (): Promise<string[]> =>
    (await indexDefs()).map(([name]) => name);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = buildDataSource();
    await dataSource.initialize();
  });

  const lastAppliedMigration = async (): Promise<string> => {
    const [row] = await dataSource.query<Array<{ name: string }>>(
      `SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
    );
    return row.name;
  };

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  // The test the whole file exists for. It fails on the unrepaired schema.
  it('runs end to end on a database that has never been migrated', async () => {
    await expect(dataSource.runMigrations()).resolves.toBeDefined();
  });

  it('leaves every destroyed index restored and no dead one recreated', async () => {
    const present = await indexNames();

    for (const name of RESTORED_INDEXES) expect(present).toContain(name);
    for (const name of DEAD_INDEXES) expect(present).not.toContain(name);
  });

  // Pins InitialSchema's own statement. On this fresh database the index came
  // from THERE — the repair's IF NOT EXISTS made its creation a verified no-op
  // — so this proves nothing about the lever that reaches production. The
  // test after the convergence case below is the one that does.
  it('builds the vehicle lookup covering index on the fresh path', async () => {
    const [row] = await dataSource.query<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_compat_vehicle_lookup'`,
    );

    expect(row.indexdef).toContain(
      '(model_id, year_id, assembly_plant_id, motorization_id)',
    );
    expect(row.indexdef).toContain('INCLUDE (product_id)');
  });

  // The production population cannot be replayed literally — the corrected
  // InitialSchema no longer emits the pre-id state — so reconstruct the deficit
  // and prove the repair closes it to the identical end state.
  it('converges an already-migrated database missing the indexes to the same state', async () => {
    const fresh = await indexDefs();

    for (const name of RESTORED_INDEXES) {
      await dataSource.query(`DROP INDEX IF EXISTS
        ${name.startsWith('idx_compat') ? 'compatibility' : name.startsWith('idx_mcm') || name.startsWith('idx_model_car') ? 'vehicles' : name.startsWith('idx_inventory') ? 'inventory' : 'pim'}.${name}`);
    }
    // All twelve, not merely "something changed": a name that stopped matching
    // its schema prefix would drop nothing and still satisfy a loose check.
    const deficit = await indexDefs();
    expect(fresh.length - deficit.length).toBe(RESTORED_INDEXES.length);

    // undoLastMigration is positional. Pin the identity so a future migration
    // with a higher timestamp fails loudly instead of silently retargeting.
    await expect(lastAppliedMigration()).resolves.toBe(REPAIR_MIGRATION);
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();

    // DEFINITIONS. This is the assertion that makes the two levers provably
    // equivalent: everything below now exists because the REPAIR migration
    // created it, and every statement must match what InitialSchema produced.
    expect(await indexDefs()).toEqual(fresh);
  });

  // Declared AFTER convergence on purpose — only here were the twelve created
  // by the repair migration. Redundant with the snapshot equality above by
  // design: it names the one property the vehicle-search direction depends on,
  // so losing it reads as a failure about covering indexes, not a diff dump.
  it('builds the vehicle lookup covering index from the repair migration', async () => {
    const [row] = await dataSource.query<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_compat_vehicle_lookup'`,
    );

    expect(row.indexdef).toContain(
      '(model_id, year_id, assembly_plant_id, motorization_id)',
    );
    expect(row.indexdef).toContain('INCLUDE (product_id)');
  });

  // Proves the IF NOT EXISTS guards hold where the indexes already exist.
  //
  // Reverting first would DROP all twelve and recreate them from absent — the
  // path convergence already covers, and one that passes with both migration
  // bodies empty. Clearing the ledger row instead leaves the indexes in place,
  // so `up()` runs against a database that already has them: without the
  // guards this throws `relation already exists`.
  it('is idempotent when every index is already present', async () => {
    const before = await indexDefs();

    await dataSource.query(`DELETE FROM migrations WHERE name = $1`, [
      REPAIR_MIGRATION,
    ]);
    const rerun = await dataSource.runMigrations();
    // Naming it, not `toBeDefined`: an empty array is defined too, and would
    // mean the guarded path was never entered and this test proved nothing.
    expect(rerun.map((m) => m.name)).toContain(REPAIR_MIGRATION);

    expect(await indexDefs()).toEqual(before);
  });
});
