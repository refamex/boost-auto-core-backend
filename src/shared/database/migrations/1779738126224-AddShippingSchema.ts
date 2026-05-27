import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingSchema1779738126224 implements MigrationInterface {
  name = 'AddShippingSchema1779738126224';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Datos de envío (destino + parcel) sobre el pedido. Nullable: los pedidos
    //    existentes no los tienen. El origen es fijo de la bodega (config).
    await queryRunner.query(`
      ALTER TABLE orders.orders
        ADD COLUMN ship_to_name         VARCHAR(150),
        ADD COLUMN ship_to_company      VARCHAR(150),
        ADD COLUMN ship_to_street1      VARCHAR(255),
        ADD COLUMN ship_to_postal_code  VARCHAR(20),
        ADD COLUMN ship_to_area_level1  VARCHAR(120),
        ADD COLUMN ship_to_area_level2  VARCHAR(120),
        ADD COLUMN ship_to_area_level3  VARCHAR(120),
        ADD COLUMN ship_to_country_code VARCHAR(2),
        ADD COLUMN ship_to_phone        VARCHAR(40),
        ADD COLUMN ship_to_email        VARCHAR(150),
        ADD COLUMN parcel_weight        NUMERIC(10,3),
        ADD COLUMN parcel_length        NUMERIC(10,2),
        ADD COLUMN parcel_width         NUMERIC(10,2),
        ADD COLUMN parcel_height        NUMERIC(10,2)
    `);

    // 2. Schema de envíos (Skydropx).
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS shipping`);
    await queryRunner.query(
      `COMMENT ON SCHEMA shipping IS 'Integración Skydropx: envíos, eventos de tracking y entregas de webhooks.'`,
    );

    await queryRunner.query(`
      CREATE TABLE shipping.shipments (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id             UUID NOT NULL REFERENCES orders.orders(id) ON DELETE RESTRICT,
        skydropx_shipment_id TEXT NOT NULL UNIQUE,
        quotation_id         TEXT,
        rate_id              TEXT,
        carrier_name         VARCHAR(120),
        service_level        VARCHAR(120),
        tracking_number      TEXT,
        tracking_url         TEXT,
        label_url            TEXT,
        status               VARCHAR(50) NOT NULL,
        amount               NUMERIC(14,2),
        currency             VARCHAR(10) NOT NULL DEFAULT 'MXN',
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE shipping.shipment_tracking_events (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id  UUID NOT NULL REFERENCES shipping.shipments(id) ON DELETE CASCADE,
        status       VARCHAR(80) NOT NULL,
        description  TEXT,
        occurred_at  TIMESTAMP WITH TIME ZONE,
        raw_json     JSONB,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE shipping.webhook_events (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skydropx_event_id  TEXT NOT NULL UNIQUE,
        event_type         VARCHAR(100) NOT NULL,
        payload_json       JSONB NOT NULL,
        processed_at       TIMESTAMP WITH TIME ZONE,
        created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_shipments_order_id ON shipping.shipments(order_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_shipments_tracking_number ON shipping.shipments(tracking_number)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_shipment_tracking_events_shipment_id ON shipping.shipment_tracking_events(shipment_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_shipping_webhook_events_event_type ON shipping.webhook_events(event_type)`,
    );

    await queryRunner.query(
      `CREATE TRIGGER trg_shipments_updated_at BEFORE UPDATE ON shipping.shipments FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_shipments_updated_at ON shipping.shipments`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS shipping.shipment_tracking_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipping.webhook_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipping.shipments`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS shipping CASCADE`);

    await queryRunner.query(`
      ALTER TABLE orders.orders
        DROP COLUMN IF EXISTS ship_to_name,
        DROP COLUMN IF EXISTS ship_to_company,
        DROP COLUMN IF EXISTS ship_to_street1,
        DROP COLUMN IF EXISTS ship_to_postal_code,
        DROP COLUMN IF EXISTS ship_to_area_level1,
        DROP COLUMN IF EXISTS ship_to_area_level2,
        DROP COLUMN IF EXISTS ship_to_area_level3,
        DROP COLUMN IF EXISTS ship_to_country_code,
        DROP COLUMN IF EXISTS ship_to_phone,
        DROP COLUMN IF EXISTS ship_to_email,
        DROP COLUMN IF EXISTS parcel_weight,
        DROP COLUMN IF EXISTS parcel_length,
        DROP COLUMN IF EXISTS parcel_width,
        DROP COLUMN IF EXISTS parcel_height
    `);
  }
}
