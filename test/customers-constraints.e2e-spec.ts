import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AddCustomersSchema1779738126227 } from '../src/shared/database/migrations/1779738126227-AddCustomersSchema';
import { describeWithDocker } from './docker-gate';

/**
 * Exercises the `customers` schema's DB-level invariants against a real
 * Postgres. Mocked-repository unit tests cannot prove a partial unique
 * index, a concurrent-write race, `ON DELETE CASCADE`, or a trigger — those
 * are only provable here. Skips locally without Docker; under CI it fails
 * instead (see `docker-gate`).
 */

describeWithDocker('customers schema constraints', () => {
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

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = buildDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM customers.customer_branch');
    await dataSource.query('DELETE FROM customers.customer_profile');
  });

  const insertProfile = async (
    overrides: {
      authCustomerId?: string | null;
      displayName?: string;
    } = {},
  ): Promise<string> => {
    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO customers.customer_profile (auth_customer_id, display_name)
       VALUES ($1, $2) RETURNING id`,
      [
        overrides.authCustomerId ?? null,
        overrides.displayName ?? 'Test Customer',
      ],
    );
    return rows[0].id;
  };

  const insertBranch = async (
    customerProfileId: string,
    isMainBranch = false,
  ): Promise<string> => {
    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO customers.customer_branch (customer_profile_id, is_main_branch)
       VALUES ($1, $2) RETURNING id`,
      [customerProfileId, isMainBranch],
    );
    return rows[0].id;
  };

  it('rejects two profiles sharing the same non-null auth_customer_id', async () => {
    const authId = '11111111-1111-1111-1111-111111111111';
    await insertProfile({ authCustomerId: authId });

    await expect(insertProfile({ authCustomerId: authId })).rejects.toThrow(
      /unique|duplicate/i,
    );
  });

  it('allows many prospects with NULL auth_customer_id', async () => {
    await insertProfile({ authCustomerId: null });
    await insertProfile({ authCustomerId: null });
    await insertProfile({ authCustomerId: null });

    const rows = await dataSource.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM customers.customer_profile',
    );
    expect(rows[0].n).toBe(3);
  });

  it('rejects two main branches for the same customer', async () => {
    const profileId = await insertProfile();
    await insertBranch(profileId, true);

    await expect(insertBranch(profileId, true)).rejects.toThrow(
      /unique|duplicate/i,
    );
  });

  it('leaves exactly one main branch when two promotions race concurrently', async () => {
    const profileId = await insertProfile();
    const mainBranchId = await insertBranch(profileId, true);
    const branchB1 = await insertBranch(profileId, false);
    const branchB2 = await insertBranch(profileId, false);
    void mainBranchId;

    // Mirrors CustomerBranchService's demote-then-promote transaction shape
    // (design D4). TX-A holds its lock through an artificial delay so TX-B's
    // demote genuinely blocks on it, then unblocks and re-checks against the
    // now-committed row — reproducing the exact race the partial unique
    // index exists to arbitrate, not just an accidental non-overlap.
    const promote = (branchId: string, sleepSeconds: number) =>
      dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE customers.customer_branch
             SET is_main_branch = FALSE
           WHERE customer_profile_id = $1 AND is_main_branch = TRUE AND id <> $2`,
          [profileId, branchId],
        );
        if (sleepSeconds > 0) {
          await manager.query('SELECT pg_sleep($1)', [sleepSeconds]);
        }
        await manager.query(
          `UPDATE customers.customer_branch SET is_main_branch = TRUE WHERE id = $1`,
          [branchId],
        );
      });

    const delayed = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return promote(branchB2, 0);
    };

    const results = await Promise.allSettled([
      promote(branchB1, 0.3),
      delayed(),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(String(rejected[0].reason)).toMatch(/unique|duplicate/i);

    const mainRows = await dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM customers.customer_branch
        WHERE customer_profile_id = $1 AND is_main_branch = TRUE`,
      [profileId],
    );
    expect(mainRows[0].n).toBe(1);
  });

  it('cascades branch deletion when the parent profile is deleted', async () => {
    const profileId = await insertProfile();
    const branchId = await insertBranch(profileId);

    await dataSource.query(
      'DELETE FROM customers.customer_profile WHERE id = $1',
      [profileId],
    );

    const rows = await dataSource.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM customers.customer_branch WHERE id = $1',
      [branchId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('fires the updated_at trigger on customer_profile update', async () => {
    const id = await insertProfile();
    const [before] = await dataSource.query<{ updated_at: string }[]>(
      'SELECT updated_at FROM customers.customer_profile WHERE id = $1',
      [id],
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    await dataSource.query(
      "UPDATE customers.customer_profile SET display_name = 'Renamed' WHERE id = $1",
      [id],
    );

    const [after] = await dataSource.query<{ updated_at: string }[]>(
      'SELECT updated_at FROM customers.customer_profile WHERE id = $1',
      [id],
    );
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });

  // Drives THIS migration by identity rather than `undoLastMigration()`, which
  // reverts whichever migration is last by timestamp. That was the customers
  // one when this test was written; appending any migration since silently
  // retargeted it, and the assertion below started passing against a schema
  // that had never been dropped. Position is not identity.
  //
  // Reverting the chain is also no longer an option at all: `ForeignKeysById`
  // declares itself irreversible once the code-based columns are gone, so the
  // runner can never walk back past it to reach this migration.
  it('migration up -> down -> up is clean', async () => {
    const migration = new AddCustomersSchema1779738126227();
    const runner = dataSource.createQueryRunner();

    try {
      await migration.down(runner);

      await expect(
        dataSource.query('SELECT 1 FROM customers.customer_profile LIMIT 1'),
      ).rejects.toThrow();

      await migration.up(runner);
    } finally {
      await runner.release();
    }

    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO customers.customer_profile (display_name) VALUES ('Post-cycle') RETURNING id`,
    );
    expect(rows).toHaveLength(1);
  });
});
