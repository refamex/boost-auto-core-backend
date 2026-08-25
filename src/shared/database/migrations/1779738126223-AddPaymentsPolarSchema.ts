import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentsPolarSchema1779738126223 implements MigrationInterface {
  name = 'AddPaymentsPolarSchema1779738126223';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS payments`);
    await queryRunner.query(
      `COMMENT ON SCHEMA payments IS 'Pasarela Polar.sh: sesiones de checkout y entregas de webhooks.'`,
    );

    await queryRunner.query(`
      CREATE TABLE payments.polar_checkouts (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id           UUID NOT NULL REFERENCES orders.orders(id) ON DELETE RESTRICT,
        polar_checkout_id  TEXT NOT NULL UNIQUE,
        polar_order_id     TEXT,
        status             VARCHAR(50) NOT NULL,
        checkout_url       TEXT NOT NULL,
        amount             NUMERIC(14,2) NOT NULL,
        currency           VARCHAR(10) NOT NULL DEFAULT 'MXN',
        created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE payments.webhook_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        polar_event_id  TEXT NOT NULL UNIQUE,
        event_type      VARCHAR(100) NOT NULL,
        payload_json    JSONB NOT NULL,
        processed_at    TIMESTAMP WITH TIME ZONE,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_polar_checkouts_order_id ON payments.polar_checkouts(order_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_polar_checkouts_polar_checkout_id ON payments.polar_checkouts(polar_checkout_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_webhook_events_event_type ON payments.webhook_events(event_type)`,
    );

    await queryRunner.query(
      `CREATE TRIGGER trg_polar_checkouts_updated_at BEFORE UPDATE ON payments.polar_checkouts FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_polar_checkouts_updated_at ON payments.polar_checkouts`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS payments.webhook_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS payments.polar_checkouts`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS payments CASCADE`);
  }
}
