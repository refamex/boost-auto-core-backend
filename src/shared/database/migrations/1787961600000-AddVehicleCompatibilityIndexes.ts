import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add indexes to support vehicle-based product search queries.
 *
 * Phase 4 of the security audit remediation added the vehicle product search
 * endpoint GET /v1/products/by-vehicle. This migration creates a compound
 * index on the compatibility table to optimize queries that filter products
 * by vehicle attributes.
 *
 * The audit identified that "la búsqueda de productos no permite filtrar por
 * vehículo en la consulta SQL, obligando al frontend cliente a descargar miles
 * de registros y filtrar en memoria."
 *
 * The compound index covers the most common vehicle filter combinations:
 * - model_id + year_id + assembly_plant_id + motorization_id
 * - INCLUDE product_id to allow index-only scans
 *
 * This index enables efficient JOIN between pim.product and
 * compatibility.compatibilities when filtering by vehicle attributes.
 *
 * IF NOT EXISTS guard ensures this is safe to run in any environment.
 */
export class AddVehicleCompatibilityIndexes1787961600000 implements MigrationInterface {
  name = 'AddVehicleCompatibilityIndexes1787961600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Compound index for vehicle-based product lookups
    // Supports queries filtering by any combination of vehicle attributes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_compat_vehicle_lookup 
       ON compatibility.compatibilities(model_id, year_id, assembly_plant_id, motorization_id) 
       INCLUDE (product_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS compatibility.idx_compat_vehicle_lookup`,
    );
  }
}
