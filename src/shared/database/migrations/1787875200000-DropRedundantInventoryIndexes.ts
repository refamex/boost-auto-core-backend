import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops two indexes on `inventory.inventory` that the table's own UNIQUE
 * constraint already provides.
 *
 * `InitialSchema` declares `UNIQUE(product_id, provider_branch_id)`, which
 * Postgres implements as a unique btree over exactly those two columns in that
 * order. That single index already serves both of these:
 *
 * - `idx_inventory_product_branch (product_id, provider_branch_id)` is a
 *   duplicate of it, column for column.
 * - `idx_inventory_product_id (product_id)` is a leading-column PREFIX of it,
 *   so every lookup it could serve the unique index serves too.
 *
 * Neither buys a read path. Both cost writes, on the table the supplier stock
 * sync rewrites twice a day.
 *
 * This is the rule `RestoreIdBasedIndexes` already applied to the compatibility
 * table — "no `idx_compat_product_id`: the surviving 5-column unique already
 * leads with `product_id`" — and failed to apply to inventory in the same file.
 * This migration makes the two consistent.
 *
 * WHY A MIGRATION AND NOT JUST AN EDIT: the same two populations as ever.
 * Editing `InitialSchema` and `RestoreIdBasedIndexes` stops FRESH databases
 * from creating these, but reaches an already-migrated production not at all —
 * and depending on whether `RestoreIdBasedIndexes` has run there yet, prod may
 * or may not have them. All three orderings converge ON THESE TWO NAMES:
 *
 * - a database built AFTER this change: never created, so the drop is a no-op.
 *   (One built from the PREVIOUS release does have them, and the drop works.)
 * - production, repair not yet run: the repair no longer creates them, and the
 *   drop is a no-op.
 * - production, repair already run: the drop removes them.
 *
 * Not a claim about the table's whole index set. A pre-existing divergence
 * survives: `ForeignKeysById` adds `uq_inventory_product_id_provider_branch_id`
 * only when that exact constraint NAME is absent, so a fresh database ends up
 * with TWO identical unique btrees over these columns — the inline one from
 * `InitialSchema` and that one — while production has only the latter. Out of
 * scope here, recorded so the next reader does not overread the paragraph above.
 *
 * ASYMMETRY IN `down()`, and it is NOT a true inverse. `up()` is a no-op on the
 * first two populations, but `down()` creates both indexes unconditionally — so
 * reverting on a fresh or dev database lands exactly the two write-cost indexes
 * this migration exists to remove, a strict SUPERSET of the prior state, and
 * `pnpm migration:revert` reaches it in one command now that this is the newest
 * migration. `IF NOT EXISTS` is there because the pre-state varies, which is the
 * same reason the inverse claim cannot hold everywhere.
 */
export class DropRedundantInventoryIndexes1787875200000 implements MigrationInterface {
  name = 'DropRedundantInventoryIndexes1787875200000';

  private readonly redundant = [
    {
      name: 'idx_inventory_product_branch',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_inventory_product_branch ON inventory.inventory(product_id, provider_branch_id)',
    },
    {
      name: 'idx_inventory_product_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory.inventory(product_id)',
    },
  ];

  /**
   * `DROP INDEX` without `CONCURRENTLY` takes ACCESS EXCLUSIVE on the parent
   * table — stronger than the SHARE lock `RestoreIdBasedIndexes` documents,
   * because it blocks READS too. That migration also takes SHARE on this same
   * table earlier in the SAME transaction, so this is a lock upgrade: a
   * concurrent stock-sync write queuing between the two deadlocks the chain,
   * and under transaction mode `all` that rolls back everything — including
   * the repair production needs. Cheap today (a catalog operation), but it is
   * the sharper of the two lock costs, not the milder one.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of this.redundant) {
      await queryRunner.query(`DROP INDEX IF EXISTS inventory.${index.name}`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [...this.redundant].reverse()) {
      await queryRunner.query(index.ddl);
    }
  }
}
