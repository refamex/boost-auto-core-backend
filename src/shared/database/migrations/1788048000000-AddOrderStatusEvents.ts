import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `orders.order_status_events` — the audit trail for order state.
 *
 * The audit found the lifecycle stepper could not show who performed a
 * transition. The cause was upstream of the UI: `confirm`, `prepare` and
 * `cancel` never received an actor and nothing recorded one, so there was no
 * data to display.
 *
 * A table rather than two columns on `orders.orders`. A `last_status_by` pair
 * answers "who did the most recent thing", and the question that gets asked is
 * "who cancelled this order last Tuesday" — which every subsequent transition
 * would have overwritten.
 *
 * NO FOREIGN KEY ON `actor_id`. Users live in autoboost-auth, a separate
 * database; there is nothing here to reference. Same reasoning as
 * `auth.revoked_tokens` in the sibling service.
 *
 * `actor_id` and `actor_email` are both nullable because not every transition
 * is performed by a person: the Polar webhook confirms orders with no user
 * context. Recording that honestly beats inventing an actor to satisfy a
 * constraint.
 */
export class AddOrderStatusEvents1788048000000 implements MigrationInterface {
  name = 'AddOrderStatusEvents1788048000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS orders.order_status_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id    UUID         NOT NULL REFERENCES orders.orders (id) ON DELETE CASCADE,
        from_status VARCHAR(40)  NULL,
        to_status   VARCHAR(40)  NOT NULL,
        actor_id    UUID         NULL,
        actor_email VARCHAR(255) NULL,
        occurred_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // The only read this table serves is "the history of one order, oldest
    // first". Ordering lives in the index so the timeline needs no sort.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_order_status_events_order
      ON orders.order_status_events (order_id, occurred_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS orders.idx_order_status_events_order`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS orders.order_status_events`);
  }
}
