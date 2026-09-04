import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a quote belong to a customer who has no platform account yet.
 *
 * Until now `quotes.customer_id` was the ONLY link a quote had to a customer,
 * and it holds an auth identity — so a rep could only quote someone already
 * registered. That is backwards for how selling actually works: the rep meets
 * the customer, quotes them, and the customer signs up afterwards, if at all.
 * The alternative was asking a salesperson to paste another person's UUID,
 * which nobody can do.
 *
 * Two columns now, with distinct jobs:
 *   `customer_profile_id` — WHO the quote is for, always present for quotes a
 *      rep authors. Points at `customers.customer_profile`, which exists from
 *      the moment the rep creates the customer, prospect or not.
 *   `customer_id` — WHICH ACCOUNT can see it, NULL until that customer links a
 *      platform account. `CustomerProfileService.link()` fills it in for every
 *      pending quote at that moment, so the customer finds their history
 *      waiting for them on first login.
 *
 * `customer_id` therefore has to drop NOT NULL. No foreign key on either: both
 * actors live in autoboost-backend-auth, matching the existing convention on
 * this table.
 */
export class AddQuoteCustomerProfile1788220800000 implements MigrationInterface {
  name = 'AddQuoteCustomerProfile1788220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE quotes.quotes ADD COLUMN IF NOT EXISTS customer_profile_id UUID NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE quotes.quotes ALTER COLUMN customer_id DROP NOT NULL`,
    );
    // Serves `link()`, which sweeps every pending quote of one profile.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_quotes_customer_profile_id
       ON quotes.quotes (customer_profile_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring NOT NULL would fail on any quote written for a prospect, which
    // is precisely what this migration enables. Those rows are deleted first:
    // a quote with neither an account nor a profile reference is unreachable
    // from every read path, so nothing is lost that was still visible.
    await queryRunner.query(
      `DELETE FROM quotes.quotes WHERE customer_id IS NULL`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS quotes.idx_quotes_customer_profile_id`);
    await queryRunner.query(
      `ALTER TABLE quotes.quotes ALTER COLUMN customer_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE quotes.quotes DROP COLUMN IF EXISTS customer_profile_id`,
    );
  }
}
