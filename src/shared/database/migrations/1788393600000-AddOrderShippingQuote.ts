import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The rate a customer accepted, stored on the order.
 *
 * WHAT THIS FIXES: `orders.shipping_total` has existed since the initial
 * schema and `order.service.ts` writes it as `0` — the only write anywhere in
 * the codebase. `PolarCheckoutService` charges `grand_total`, which was
 * `subtotal + tax_total`. Meanwhile the checkout screen displayed
 * `subtotal + iva + flete`. The customer saw one total and was charged another,
 * and the difference was the freight, every time.
 *
 * Storing the quotation and rate ids is what lets the server price the freight
 * from an amount SKYDROPX returned rather than one the browser sent. The client
 * posts a `rate_id` — a choice — and never a price.
 *
 * `shipping_rates_json` keeps the full quote reply so the selection endpoint can
 * resolve a rate id without re-quoting (a second call would return different
 * ids and could return a different price). It is evidence of what was offered,
 * which matters when a customer disputes what they were charged.
 */
export class AddOrderShippingQuote1788393600000 implements MigrationInterface {
  name = 'AddOrderShippingQuote1788393600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders.orders
        ADD COLUMN shipping_quotation_id  VARCHAR(120),
        ADD COLUMN shipping_rate_id       VARCHAR(120),
        ADD COLUMN shipping_carrier_name  VARCHAR(120),
        ADD COLUMN shipping_service_level VARCHAR(120),
        ADD COLUMN shipping_quoted_at     TIMESTAMP,
        ADD COLUMN shipping_rates_json    JSONB
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN orders.orders.shipping_quoted_at IS 'NULL means no rate was ever accepted. PolarCheckoutService refuses to charge such an order.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN orders.orders.shipping_rates_json IS 'The full Skydropx quote reply the customer chose from. Evidence of what was offered.'`,
    );

    // Every existing order predates freight being charged at all. Leaving them
    // NULL is the honest state: nobody accepted a rate on them, and the guard
    // in PolarCheckoutService should say so rather than let them through on a
    // backfilled zero that would read as "shipping was free".
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders.orders
        DROP COLUMN shipping_rates_json,
        DROP COLUMN shipping_quoted_at,
        DROP COLUMN shipping_service_level,
        DROP COLUMN shipping_carrier_name,
        DROP COLUMN shipping_rate_id,
        DROP COLUMN shipping_quotation_id
    `);
  }
}
