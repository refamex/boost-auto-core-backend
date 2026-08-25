import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveInventoryProviderSku1787702400000 implements MigrationInterface {
  name = 'RemoveInventoryProviderSku1787702400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS inventory.idx_inventory_provider_sku',
    );
    await queryRunner.query(
      'ALTER TABLE inventory.inventory DROP COLUMN IF EXISTS provider_sku',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE inventory.inventory ADD COLUMN IF NOT EXISTS provider_sku TEXT',
    );
  }
}
