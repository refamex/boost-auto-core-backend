import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a rep negotiate a line: a manual unit price, or a percentage off list.
 *
 * Until now the only price a quote could carry was whatever the customer's
 * price list resolved to. That is the right DEFAULT, but a quote is where a
 * salesperson negotiates — the number that ends up on the document is the one
 * that was agreed, not the one the list suggested.
 *
 * Two columns, because one cannot answer both questions:
 *   `list_price_snapshot` — what the list said, frozen at creation. Keeping it
 *      is what makes the discount auditable later: without it, a line priced at
 *      900 is indistinguishable from a 1000 list price with 10% off, and nobody
 *      can tell afterwards whether a discount was ever granted.
 *   `discount_pct` — how much was taken off. NOT NULL DEFAULT 0 so every
 *      existing row reads as "no discount", which is exactly what they are.
 *
 * `unit_price_snapshot` keeps its meaning: the EFFECTIVE price charged. Nothing
 * downstream that reads it — totals, the order it converts into, the PDF — has
 * to change, which is the point of not repurposing it.
 *
 * Backfill sets `list_price_snapshot = unit_price_snapshot` for existing rows:
 * they were priced straight off the list, so the two are equal by definition.
 */
export class AddQuoteItemDiscount1788307200000 implements MigrationInterface {
  name = 'AddQuoteItemDiscount1788307200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE quotes.quote_items
         ADD COLUMN IF NOT EXISTS list_price_snapshot NUMERIC(14,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE quotes.quote_items
         ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE quotes.quote_items
          SET list_price_snapshot = unit_price_snapshot
        WHERE list_price_snapshot IS NULL`,
    );
    // A discount outside 0–100 is not a negotiation, it is a data error: 110%
    // would make the customer owe nothing and the line total negative.
    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, and this chain is re-run
    // against already-migrated databases. QueryRunner.query returns `any`; the
    // cast satisfies no-unsafe-*.
    const constraintExists = (await queryRunner.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_quote_items_discount_pct'
        AND connamespace = 'quotes'::regnamespace
    `)) as unknown[];

    if (constraintExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE quotes.quote_items
           ADD CONSTRAINT ck_quote_items_discount_pct
           CHECK (discount_pct >= 0 AND discount_pct <= 100)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE quotes.quote_items DROP CONSTRAINT IF EXISTS ck_quote_items_discount_pct`,
    );
    await queryRunner.query(
      `ALTER TABLE quotes.quote_items DROP COLUMN IF EXISTS discount_pct`,
    );
    await queryRunner.query(
      `ALTER TABLE quotes.quote_items DROP COLUMN IF EXISTS list_price_snapshot`,
    );
  }
}
