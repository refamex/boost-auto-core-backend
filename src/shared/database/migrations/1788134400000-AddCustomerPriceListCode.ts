import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `customers.customer_profile` the price list its orders and quotes are
 * priced against — UC-07 step 4, "apply the customer's price list automatically".
 *
 * The link existed nowhere core could reach it. `identity.customer_profiles`
 * in autoboost-backend-auth has carried a `price_list_code` column since its
 * initial schema, but nothing ever carried the value across, so every order
 * priced off the default list or off `pim.product.price`. Meanwhile
 * `CreateOrderDto.priceListCode` accepted a code straight from the request
 * body — which becomes a way for a buyer to pick a cheaper list the moment
 * one exists. Core owning the column is what lets the service resolve the
 * list from the customer instead of believing the caller.
 *
 * A REAL FOREIGN KEY, unlike `auth_customer_id` next to it. Price lists live
 * in this database (`commerce.price_lists`), so the reference is enforceable
 * here in a way a cross-service id never is.
 *
 * ON DELETE RESTRICT, not SET NULL. Dropping a list that customers are
 * assigned to would silently move them onto default pricing — a change to
 * what people are charged, made by a delete that looked unrelated. Refusing
 * the delete until they are reassigned is the honest failure;
 * `PriceListService.remove` translates it to a 409.
 */
export class AddCustomerPriceListCode1788134400000
  implements MigrationInterface {
  name = 'AddCustomerPriceListCode1788134400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
      ADD COLUMN IF NOT EXISTS price_list_code VARCHAR(50) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
      ADD CONSTRAINT fk_customer_profile_price_list_code
      FOREIGN KEY (price_list_code)
      REFERENCES commerce.price_lists (code)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    `);

    // Resolving a customer's list runs on the create/preview path of every
    // order, and RESTRICT makes each price-list delete scan for referencing
    // rows. Both read this column.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_profile_price_list_code
      ON customers.customer_profile (price_list_code)
      WHERE price_list_code IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS customers.idx_customer_profile_price_list_code`,
    );
    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
      DROP CONSTRAINT IF EXISTS fk_customer_profile_price_list_code
    `);
    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
      DROP COLUMN IF EXISTS price_list_code
    `);
  }
}
