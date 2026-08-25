import { MigrationInterface, QueryRunner } from 'typeorm';

type Ref = {
  schema: string;
  table: string;
  oldColumn: string;
  newColumn: string;
  targetSchema: string;
  targetTable: string;
  lookupColumn: string;
  type: 'INTEGER' | 'BIGINT';
  nullable: boolean;
  onDelete: string;
};

const REFS: Ref[] = [
  {
    schema: 'pim',
    table: 'brand_category',
    oldColumn: 'brand_code',
    newColumn: 'brand_id',
    targetSchema: 'pim',
    targetTable: 'brand',
    lookupColumn: 'brand_code',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'CASCADE',
  },
  {
    schema: 'pim',
    table: 'brand_category',
    oldColumn: 'category_code',
    newColumn: 'category_id',
    targetSchema: 'pim',
    targetTable: 'category',
    lookupColumn: 'code',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'CASCADE',
  },
  {
    schema: 'pim',
    table: 'product_dimension',
    oldColumn: 'product_sku',
    newColumn: 'product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: false,
    onDelete: 'CASCADE',
  },
  {
    schema: 'pim',
    table: 'products_image',
    oldColumn: 'product_sku',
    newColumn: 'product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'CASCADE',
  },
  {
    schema: 'pim',
    table: 'product_cross_references',
    oldColumn: 'product_sku',
    newColumn: 'product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: false,
    onDelete: 'CASCADE',
  },
  {
    schema: 'pim',
    table: 'product_cross_references',
    oldColumn: 'product_brand',
    newColumn: 'product_brand_id',
    targetSchema: 'pim',
    targetTable: 'brand',
    lookupColumn: 'brand_code',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'SET NULL',
  },
  {
    schema: 'pim',
    table: 'product_cross_references',
    oldColumn: 'reference_sku',
    newColumn: 'reference_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'SET NULL',
  },
  {
    schema: 'pim',
    table: 'product_cross_references',
    oldColumn: 'reference_brand',
    newColumn: 'reference_brand_id',
    targetSchema: 'pim',
    targetTable: 'brand',
    lookupColumn: 'brand_code',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'SET NULL',
  },
  {
    schema: 'pim',
    table: 'product_cross_references',
    oldColumn: 'reference_product_sku',
    newColumn: 'reference_product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: true,
    onDelete: 'SET NULL',
  },
  {
    schema: 'vehicles',
    table: 'model_car',
    oldColumn: 'code_assembly_plant',
    newColumn: 'assembly_plant_id',
    targetSchema: 'vehicles',
    targetTable: 'assembly_plant',
    lookupColumn: 'code',
    type: 'BIGINT',
    nullable: true,
    onDelete: 'SET NULL',
  },
  {
    schema: 'vehicles',
    table: 'model_car_motorization',
    oldColumn: 'model_car_code',
    newColumn: 'model_car_id',
    targetSchema: 'vehicles',
    targetTable: 'model_car',
    lookupColumn: 'code_model',
    type: 'BIGINT',
    nullable: true,
    onDelete: 'CASCADE',
  },
  {
    schema: 'vehicles',
    table: 'model_car_motorization',
    oldColumn: 'motorization_code',
    newColumn: 'motorization_id',
    targetSchema: 'vehicles',
    targetTable: 'motorization_car',
    lookupColumn: 'code',
    type: 'BIGINT',
    nullable: true,
    onDelete: 'CASCADE',
  },
  {
    schema: 'compatibility',
    table: 'compatibilities',
    oldColumn: 'sku',
    newColumn: 'product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: false,
    onDelete: 'CASCADE',
  },
  {
    schema: 'compatibility',
    table: 'compatibilities',
    oldColumn: 'assembly_plant_code',
    newColumn: 'assembly_plant_id',
    targetSchema: 'vehicles',
    targetTable: 'assembly_plant',
    lookupColumn: 'code',
    type: 'BIGINT',
    nullable: false,
    onDelete: 'RESTRICT',
  },
  {
    schema: 'compatibility',
    table: 'compatibilities',
    oldColumn: 'model_code',
    newColumn: 'model_id',
    targetSchema: 'vehicles',
    targetTable: 'model_car',
    lookupColumn: 'code_model',
    type: 'BIGINT',
    nullable: false,
    onDelete: 'RESTRICT',
  },
  {
    schema: 'compatibility',
    table: 'compatibilities',
    oldColumn: 'year_code',
    newColumn: 'year_id',
    targetSchema: 'vehicles',
    targetTable: 'year_car',
    lookupColumn: 'code',
    type: 'INTEGER',
    nullable: false,
    onDelete: 'RESTRICT',
  },
  {
    schema: 'compatibility',
    table: 'compatibilities',
    oldColumn: 'motorization_code',
    newColumn: 'motorization_id',
    targetSchema: 'vehicles',
    targetTable: 'motorization_car',
    lookupColumn: 'code',
    type: 'BIGINT',
    nullable: false,
    onDelete: 'RESTRICT',
  },
  {
    schema: 'inventory',
    table: 'inventory',
    oldColumn: 'product_sku',
    newColumn: 'product_id',
    targetSchema: 'pim',
    targetTable: 'product',
    lookupColumn: 'sku',
    type: 'INTEGER',
    nullable: false,
    onDelete: 'RESTRICT',
  },
];

export class ForeignKeysById1787616000000 implements MigrationInterface {
  name = 'ForeignKeysById1787616000000';

  async up(q: QueryRunner): Promise<void> {
    for (const ref of REFS) await this.migrateReference(q, ref);
    await this.replaceUnique(q, 'pim', 'brand_category', [
      'brand_id',
      'category_id',
    ]);
    await this.replaceUnique(q, 'vehicles', 'model_car_motorization', [
      'model_car_id',
      'motorization_id',
    ]);
    await this.replaceUnique(q, 'compatibility', 'compatibilities', [
      'product_id',
      'assembly_plant_id',
      'model_id',
      'year_id',
      'motorization_id',
    ]);
    await this.replaceUnique(q, 'inventory', 'inventory', [
      'product_id',
      'provider_branch_id',
    ]);
  }

  down(): Promise<void> {
    throw new Error(
      'ForeignKeysById is intentionally irreversible after code-based columns are removed',
    );
  }

  private async migrateReference(q: QueryRunner, r: Ref): Promise<void> {
    const state = await this.selectOne<{
      old_exists: boolean;
      new_exists: boolean;
    }>(
      q,
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3) AS old_exists,
              EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$4) AS new_exists`,
      [r.schema, r.table, r.oldColumn, r.newColumn],
    );
    if (!state.new_exists)
      await q.query(
        `ALTER TABLE "${r.schema}"."${r.table}" ADD COLUMN "${r.newColumn}" ${r.type}`,
      );
    if (state.old_exists) {
      await q.query(
        `UPDATE "${r.schema}"."${r.table}" src SET "${r.newColumn}"=target.id FROM "${r.targetSchema}"."${r.targetTable}" target WHERE src."${r.newColumn}" IS NULL AND src."${r.oldColumn}"=target."${r.lookupColumn}"`,
      );
      const orphans = await this.selectOne<{ count: number }>(
        q,
        `SELECT COUNT(*)::int AS count FROM "${r.schema}"."${r.table}" WHERE "${r.oldColumn}" IS NOT NULL AND "${r.newColumn}" IS NULL`,
      );
      if (Number(orphans.count) > 0)
        throw new Error(
          `Cannot migrate ${r.schema}.${r.table}.${r.oldColumn}: ${orphans.count} orphan references`,
        );
      await q.query(
        `ALTER TABLE "${r.schema}"."${r.table}" DROP COLUMN "${r.oldColumn}" CASCADE`,
      );
    }
    if (!r.nullable) {
      const nulls = await this.selectOne<{ count: number }>(
        q,
        `SELECT COUNT(*)::int AS count FROM "${r.schema}"."${r.table}" WHERE "${r.newColumn}" IS NULL`,
      );
      if (Number(nulls.count) > 0)
        throw new Error(
          `Cannot require ${r.schema}.${r.table}.${r.newColumn}: ${nulls.count} null references`,
        );
      await q.query(
        `ALTER TABLE "${r.schema}"."${r.table}" ALTER COLUMN "${r.newColumn}" SET NOT NULL`,
      );
    }
    const constraint = `fk_${r.table}_${r.newColumn}`;
    const exists = await this.selectOne<{ value: boolean }>(
      q,
      'SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=$1) AS value',
      [constraint],
    );
    if (!exists.value)
      await q.query(
        `ALTER TABLE "${r.schema}"."${r.table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${r.newColumn}") REFERENCES "${r.targetSchema}"."${r.targetTable}"(id) ON DELETE ${r.onDelete}`,
      );
  }

  /**
   * `QueryRunner.query` is declared `Promise<any>`, so every read from a result
   * row is unchecked. Naming the row shape at each call site turns a typo in a
   * column alias into a compile error instead of a silent `undefined` — which
   * matters here, because these reads gate whether a column gets dropped.
   */
  private async selectOne<T>(
    q: QueryRunner,
    sql: string,
    parameters?: unknown[],
  ): Promise<T> {
    const rows = (await q.query(sql, parameters)) as T[];
    return rows[0];
  }

  private async replaceUnique(
    q: QueryRunner,
    schema: string,
    table: string,
    columns: string[],
  ): Promise<void> {
    const name = `uq_${table}_${columns.join('_')}`;
    const exists = await this.selectOne<{ value: boolean }>(
      q,
      'SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=$1) AS value',
      [name],
    );
    if (!exists.value)
      await q.query(
        `ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${name}" UNIQUE (${columns.map((c) => `"${c}"`).join(', ')})`,
      );
  }
}
