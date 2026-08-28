import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add indexes to support paginated PIM taxonomy queries.
 *
 * Phase 2 of the security audit remediation added pagination to the PIM
 * taxonomy endpoints (/v1/brands, /v1/categories, /v1/departments). These
 * indexes optimize the common query patterns:
 *
 * - Brands: ORDER BY name + optional WHERE is_active filter
 * - Categories: ORDER BY code + optional WHERE is_active filter + JOIN department
 * - Departments: ORDER BY code + optional WHERE is_active filter
 *
 * Each index is a compound covering index that allows index-only scans for
 * the most common query patterns. The leading column matches the filter
 * (is_active), followed by the sort key (name/code), which makes them
 * effective for both filtered and unfiltered queries.
 *
 * IF NOT EXISTS guards ensure this is safe to run in any environment,
 * including local databases that may have manually created these indexes.
 */
export class AddPimPaginationIndexes1787875200000 implements MigrationInterface {
  name = 'AddPimPaginationIndexes1787875200000';

  private readonly indexes: Array<{
    schema: string;
    name: string;
    ddl: string;
  }> = [
    // Supports: SELECT * FROM pim.brand WHERE is_active = true ORDER BY name
    // Also useful for: ORDER BY name without filter (is_active is low cardinality)
    {
      schema: 'pim',
      name: 'idx_brand_active_name',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_brand_active_name ON pim.brand(is_active, name)',
    },

    // Supports: SELECT * FROM pim.category WHERE is_active = true ORDER BY code
    // Also covers JOIN with department via id_department
    {
      schema: 'pim',
      name: 'idx_category_active_code',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_category_active_code ON pim.category(is_active, code)',
    },

    // Supports: JOIN pim.category_department WHERE id_department = ?
    // Postgres doesn't auto-index FK referencing columns, needed for ON DELETE RESTRICT checks
    {
      schema: 'pim',
      name: 'idx_category_department_id',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_category_department_id ON pim.category(id_department)',
    },

    // Supports: SELECT * FROM pim.category_department WHERE is_active = true ORDER BY code
    {
      schema: 'pim',
      name: 'idx_department_active_code',
      ddl: 'CREATE INDEX IF NOT EXISTS idx_department_active_code ON pim.category_department(is_active, code)',
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
