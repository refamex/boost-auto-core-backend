import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores every secondary index the id migration silently destroyed.
 *
 * `fdcc5ee` rewrote the `CREATE TABLE` statements in `InitialSchema` from
 * code/sku columns to id columns and updated only some of the matching
 * `CREATE INDEX` statements. That left two populations with different history:
 *
 * - A FRESH database runs the corrected `InitialSchema` and gets every index
 *   from there. This migration then finds them all present and does nothing.
 * - PRODUCTION recorded `InitialSchema` before the correction, so editing that
 *   file reaches it not at all. It ran the ORIGINAL code-based statements, and
 *   `ForeignKeysById` later dropped those columns `CASCADE`, taking every
 *   dependent index with them. This migration is the only thing that reaches
 *   it.
 *
 * Hence twelve names, not seven: the five below marked "prod-only" already read
 * as corrected in `InitialSchema`, which is exactly why nobody noticed
 * production does not have them. `idx_inventory_product_id` is the costly one —
 * `zeroOutMissing` filters `product_id = ANY(...)` against a table the stock
 * sync rewrites twice a day.
 *
 * `IF NOT EXISTS` is what lets one migration serve both: a verified no-op on
 * fresh, a full repair on production.
 *
 * No defensive `DROP INDEX` for the dead code-based names: `ForeignKeysById`
 * runs earlier in the chain and already removed them everywhere, including on a
 * half-migrated staging database.
 *
 * ASYMMETRY IN `down()`, deliberate: it is a true inverse on production, where
 * `up()` created all twelve. On a fresh database `InitialSchema` owns them and
 * `up()` was a no-op, so reverting drops indexes this migration never made,
 * while the migrations table still shows `InitialSchema` applied. Only a full
 * `pnpm db:reset` restores that. Acceptable because reverting is a dev-only
 * operation, but it would surprise someone unwritten.
 */
export class RestoreIdBasedIndexes1787788800000 implements MigrationInterface {
  name = 'RestoreIdBasedIndexes1787788800000';

  private readonly indexes: Array<{
    schema: string;
    name: string;
    ddl: string;
  }> = [
    // --- vehicle -> product, the direction nothing indexes today ---------
    // Leading column is the one always supplied: this is a cascading
    // selector, so model is chosen first and constrains the rest. That makes
    // every realistic filter combination a usable prefix. `product_id` is
    // only ever projected here, never a predicate, so INCLUDE keeps the
    // inner pages narrow and still makes the EXISTS probe index-only.
    {
      schema: 'compatibility',
      name: 'idx_compat_vehicle_lookup',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_compat_vehicle_lookup ON compatibility.compatibilities(model_id, year_id, assembly_plant_id, motorization_id) INCLUDE (product_id)',
    },
    // Postgres does not index the referencing side of a foreign key, and all
    // three are ON DELETE RESTRICT — without these, deleting one taxonomy row
    // seq-scans this table. They also cover the filter combinations that skip
    // the leading column.
    {
      schema: 'compatibility',
      name: 'idx_compat_year_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_compat_year_id ON compatibility.compatibilities(year_id)',
    },
    {
      schema: 'compatibility',
      name: 'idx_compat_plant_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_compat_plant_id ON compatibility.compatibilities(assembly_plant_id)',
    },
    {
      schema: 'compatibility',
      name: 'idx_compat_motorization_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_compat_motorization_id ON compatibility.compatibilities(motorization_id)',
    },
    // No `idx_compat_product_id`: the surviving 5-column unique already leads
    // with `product_id`. No `idx_compat_model_id`: the lookup index above
    // leads with it.

    // --- motorization -> model, the inverse of the surviving unique ------
    {
      schema: 'vehicles',
      name: 'idx_mcm_motorization_model',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_mcm_motorization_model ON vehicles.model_car_motorization(motorization_id, model_car_id)',
    },
    {
      schema: 'vehicles',
      name: 'idx_model_car_plant_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_model_car_plant_id ON vehicles.model_car(assembly_plant_id)',
    },

    // --- prod-only: these read as corrected in InitialSchema, so their
    // absence in production is invisible from the file --------------------
    {
      schema: 'pim',
      name: 'idx_pxref_product_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_pxref_product_id ON pim.product_cross_references(product_id)',
    },
    {
      schema: 'pim',
      name: 'idx_pxref_reference_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_pxref_reference_id ON pim.product_cross_references(reference_id)',
    },
    {
      schema: 'pim',
      name: 'idx_products_image_product',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_products_image_product ON pim.products_image(product_id)',
    },
    {
      schema: 'inventory',
      name: 'idx_inventory_product_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory.inventory(product_id)',
    },
    {
      schema: 'inventory',
      name: 'idx_inventory_product_branch',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_inventory_product_branch ON inventory.inventory(product_id, provider_branch_id)',
    },
    {
      schema: 'inventory',
      name: 'idx_inventory_stock',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory.inventory(product_id, stock)',
    },
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of this.indexes) {
      await queryRunner.query(index.ddl);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [...this.indexes].reverse()) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS ${index.schema}.${index.name}`,
      );
    }
  }
}
