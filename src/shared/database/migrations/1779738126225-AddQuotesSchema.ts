import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuotesSchema1779738126225 implements MigrationInterface {
  name = 'AddQuotesSchema1779738126225';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Volume tiers on price list items.
    //
    //    The original constraint is UNIQUE(price_list_id, product_id, valid_from),
    //    which leaves min_qty out. Two simultaneous tiers for the same product
    //    therefore collide unless they are given different valid_from dates,
    //    overloading a validity column as a tier discriminator. Adding min_qty
    //    makes tiers expressible and keeps them unique per validity window.
    //
    //    This is the first named constraint in this repo; naming is unavoidable
    //    when replacing one. IF EXISTS so a divergent auto-generated name in some
    //    environment degrades instead of aborting the migration.
    await queryRunner.query(`
      ALTER TABLE commerce.price_list_items
        DROP CONSTRAINT IF EXISTS price_list_items_price_list_id_product_id_valid_from_key
    `);
    await queryRunner.query(`
      ALTER TABLE commerce.price_list_items
        ADD CONSTRAINT price_list_items_pl_product_minqty_validfrom_key
        UNIQUE (price_list_id, product_id, min_qty, valid_from)
    `);

    // 2. Schema de cotizaciones.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS quotes`);
    await queryRunner.query(
      `COMMENT ON SCHEMA quotes IS 'Cotizaciones de venta: documento con vigencia, precios congelados y conversión a pedido.'`,
    );

    await queryRunner.query(`
      CREATE TABLE quotes.quotes (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_number       VARCHAR(80) NOT NULL UNIQUE,
        customer_id        UUID NOT NULL,
        sales_rep_id       UUID,
        price_list_id      UUID REFERENCES commerce.price_lists(id) ON DELETE SET NULL,
        currency           VARCHAR(10) NOT NULL DEFAULT 'MXN',
        status             VARCHAR(50) NOT NULL,
        valid_until        TIMESTAMP WITH TIME ZONE NOT NULL,
        subtotal           NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
        grand_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
        converted_order_id UUID REFERENCES orders.orders(id) ON DELETE SET NULL,
        notes              TEXT,
        created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE quotes.quote_items (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_id            UUID NOT NULL REFERENCES quotes.quotes(id) ON DELETE CASCADE,
        product_id          INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE RESTRICT,
        price_list_item_id  UUID REFERENCES commerce.price_list_items(id) ON DELETE SET NULL,
        sku_snapshot        TEXT NOT NULL,
        name_snapshot       TEXT NOT NULL,
        qty                 NUMERIC(14,2) NOT NULL,
        unit_price_snapshot NUMERIC(14,2) NOT NULL,
        tax_snapshot        NUMERIC(14,2) NOT NULL DEFAULT 0,
        line_total          NUMERIC(14,2) NOT NULL,
        created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_quotes_customer_id ON quotes.quotes(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_quotes_sales_rep_id ON quotes.quotes(sales_rep_id)`,
    );
    // Reads always filter by status, and the sent/expired split filters by
    // valid_until on top of it.
    await queryRunner.query(
      `CREATE INDEX idx_quotes_status_valid_until ON quotes.quotes(status, valid_until)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_quote_items_quote_id ON quotes.quote_items(quote_id)`,
    );

    await queryRunner.query(
      `CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON quotes.quotes FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes.quotes`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS quotes.quote_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotes.quotes`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS quotes CASCADE`);

    await queryRunner.query(`
      ALTER TABLE commerce.price_list_items
        DROP CONSTRAINT IF EXISTS price_list_items_pl_product_minqty_validfrom_key
    `);
    await queryRunner.query(`
      ALTER TABLE commerce.price_list_items
        ADD CONSTRAINT price_list_items_price_list_id_product_id_valid_from_key
        UNIQUE (price_list_id, product_id, valid_from)
    `);
  }
}
