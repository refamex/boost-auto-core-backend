import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------
    // SCHEMAS
    // -----------------------------------------------------
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS pim`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS vehicles`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS compatibility`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS suppliers`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS inventory`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS commerce`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS orders`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS sales`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS billing`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS integrations`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS utils`);

    await queryRunner.query(
      `COMMENT ON SCHEMA pim           IS 'Product Information Management: producto, marca, categoría, departamento, color, dimensión, imagen, cross-reference.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA vehicles      IS 'Taxonomía vehicular: armadora, modelo, año, motorización.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA compatibility IS 'Compatibilidad SKU ↔ vehículo (qué refacción embona en qué auto).'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA suppliers     IS 'Proveedores, sucursales y vínculo con marcas.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA inventory     IS 'Stock por SKU y sucursal de proveedor.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA commerce      IS 'Configuración comercial: listas de precios, métodos de pago.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA orders        IS 'Órdenes de compra, items y pagos.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA sales         IS 'Ventas consolidadas (eCommerce, POS, etc.).'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA billing       IS 'Facturación electrónica (CFDI / SAT).'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA integrations  IS 'API clients, jobs de integración y logs.'`,
    );
    await queryRunner.query(
      `COMMENT ON SCHEMA utils         IS 'Funciones y helpers compartidos.'`,
    );

    // -----------------------------------------------------
    // HELPERS
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION utils.set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // -----------------------------------------------------
    // SCHEMA: pim (taxonomies)
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE pim.category_department (
        id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code            VARCHAR NOT NULL UNIQUE,
        department_name VARCHAR NOT NULL,
        is_active       BOOLEAN   DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.category (
        id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name          TEXT    NOT NULL,
        description   TEXT,
        code          TEXT    NOT NULL UNIQUE,
        id_department INTEGER NOT NULL REFERENCES pim.category_department(id),
        image         TEXT,
        is_active     BOOLEAN   DEFAULT TRUE,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.brand (
        id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name       TEXT                     NOT NULL,
        brand_code TEXT UNIQUE,
        image      TEXT,
        is_active  BOOLEAN                  DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.brand_category (
        id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        brand_id      INTEGER REFERENCES pim.brand(id) ON DELETE CASCADE,
        category_id   INTEGER REFERENCES pim.category(id) ON DELETE CASCADE,
        is_active     BOOLEAN DEFAULT TRUE,
        UNIQUE(brand_id, category_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.category_complement (
        id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        category_index_id      INTEGER REFERENCES pim.category(id),
        category_complement_id INTEGER REFERENCES pim.category(id),
        created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        CHECK (category_index_id <> category_complement_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.volume_category (
        id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code        TEXT NOT NULL UNIQUE,
        description TEXT,
        weight      DOUBLE PRECISION,
        height      DOUBLE PRECISION,
        width       DOUBLE PRECISION,
        length      DOUBLE PRECISION,
        created_at  DATE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.auto_part_catalog (
        id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name               TEXT NOT NULL,
        code               TEXT UNIQUE,
        volume_category_id INTEGER REFERENCES pim.volume_category(id),
        category_id        INTEGER REFERENCES pim.category(id),
        is_activate        BOOLEAN DEFAULT TRUE,
        created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: suppliers
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE suppliers.provider (
        id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name              TEXT,
        direction         TEXT,
        city              TEXT,
        state             TEXT,
        postal_code       VARCHAR,
        representative    TEXT,
        phone             TEXT,
        email             TEXT,
        inventory_reading TEXT,
        warranty          TEXT,
        code_identity     TEXT UNIQUE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE suppliers.provider_branch (
        id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        provider_id    BIGINT  NOT NULL REFERENCES suppliers.provider(id),
        branch_name    VARCHAR NOT NULL,
        contact_person VARCHAR,
        phone          VARCHAR NOT NULL,
        email          VARCHAR,
        address        TEXT    NOT NULL,
        city           VARCHAR NOT NULL,
        postal_code    VARCHAR NOT NULL,
        is_main_branch BOOLEAN DEFAULT FALSE NOT NULL,
        is_active      BOOLEAN DEFAULT TRUE  NOT NULL,
        notes          TEXT,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE suppliers.brand_provider (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        brand_id    INTEGER NOT NULL REFERENCES pim.brand(id)          ON DELETE CASCADE,
        provider_id BIGINT  NOT NULL REFERENCES suppliers.provider(id) ON DELETE CASCADE,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        UNIQUE(brand_id, provider_id)
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: pim (product y dependientes)
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE pim.product (
        id                         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        sku                        TEXT NOT NULL UNIQUE,
        name                       TEXT,
        description                TEXT,
        category_id                BIGINT REFERENCES pim.category(id),
        brand_id                   BIGINT REFERENCES pim.brand(id) ON UPDATE CASCADE ON DELETE CASCADE,
        provider_id                BIGINT REFERENCES suppliers.provider(id),
        auto_part_type_id          BIGINT REFERENCES pim.auto_part_catalog(id),
        provider_sku               TEXT,
        classification_by_rotation TEXT,
        warranty_period            BIGINT,
        is_visible                 BOOLEAN DEFAULT TRUE,
        principal_image            TEXT,
        price                      DOUBLE PRECISION,
        created_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.product_color (
        id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        id_product INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE CASCADE,
        name       TEXT,
        code       TEXT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.product_dimension (
        id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id  INTEGER NOT NULL UNIQUE REFERENCES pim.product(id) ON DELETE CASCADE,
        length      DOUBLE PRECISION,
        width       DOUBLE PRECISION NOT NULL,
        height      DOUBLE PRECISION,
        weight      DOUBLE PRECISION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.products_image (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id  INTEGER REFERENCES pim.product(id) ON DELETE CASCADE,
        url         TEXT,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pim.product_cross_references (
        id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        product_id           INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE CASCADE,
        product_brand_id     INTEGER REFERENCES pim.brand(id) ON DELETE SET NULL,
        reference_id         INTEGER REFERENCES pim.product(id) ON DELETE SET NULL,
        reference_brand_id   INTEGER REFERENCES pim.brand(id) ON DELETE SET NULL,
        reference_product_id INTEGER REFERENCES pim.product(id) ON DELETE SET NULL,
        provider_sku         TEXT,
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: vehicles
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE vehicles.assembly_plant (
        id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code           TEXT UNIQUE,
        assembly_plant TEXT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vehicles.model_car (
        id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code_model          TEXT UNIQUE,
        model_car           TEXT,
        assembly_plant_id BIGINT REFERENCES vehicles.assembly_plant(id) ON DELETE SET NULL,
        created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vehicles.year_car (
        id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code       TEXT UNIQUE,
        year       TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vehicles.motorization_car (
        id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code         TEXT UNIQUE,
        motorization TEXT,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE vehicles.model_car_motorization (
        id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        model_car_id      BIGINT REFERENCES vehicles.model_car(id) ON DELETE CASCADE,
        motorization_id   BIGINT REFERENCES vehicles.motorization_car(id) ON DELETE CASCADE,
        UNIQUE(model_car_id, motorization_id)
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: compatibility
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE compatibility.compatibilities (
        id                BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        product_id        INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE CASCADE,
        assembly_plant_id BIGINT NOT NULL REFERENCES vehicles.assembly_plant(id) ON DELETE RESTRICT,
        model_id          BIGINT NOT NULL REFERENCES vehicles.model_car(id) ON DELETE RESTRICT,
        year_id           INTEGER NOT NULL REFERENCES vehicles.year_car(id) ON DELETE RESTRICT,
        motorization_id   BIGINT NOT NULL REFERENCES vehicles.motorization_car(id) ON DELETE RESTRICT,
        created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        UNIQUE(product_id, assembly_plant_id, model_id, year_id, motorization_id)
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: inventory
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE inventory.inventory (
        id                 SERIAL PRIMARY KEY,
        product_id         INTEGER NOT NULL REFERENCES pim.product(id) ON DELETE RESTRICT,
        provider_sku       TEXT    NOT NULL,
        provider_branch_id BIGINT  NOT NULL REFERENCES suppliers.provider_branch(id),
        stock              INTEGER NOT NULL DEFAULT 0,
        reserved_stock     INTEGER          DEFAULT 0,
        updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(product_id, provider_branch_id)
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: commerce
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE commerce.price_lists (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code          VARCHAR(50) UNIQUE NOT NULL,
        name          VARCHAR(255) NOT NULL,
        customer_type VARCHAR(50),
        currency      VARCHAR(10) DEFAULT 'MXN',
        is_default    BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE commerce.price_list_items (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        price_list_id UUID    NOT NULL REFERENCES commerce.price_lists(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES pim.product(id),
        price         NUMERIC(14,2) NOT NULL,
        min_qty       INT DEFAULT 1,
        valid_from    DATE,
        valid_to      DATE,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(price_list_id, product_id, valid_from)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE commerce.payment_methods (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code       VARCHAR(50) UNIQUE NOT NULL,
        name       VARCHAR(150) NOT NULL,
        provider   VARCHAR(150),
        is_active  BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: orders
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE orders.orders (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number       VARCHAR(80) UNIQUE NOT NULL,
        customer_id        UUID NOT NULL,
        sales_rep_id       UUID NULL,
        provider_branch_id BIGINT NULL REFERENCES suppliers.provider_branch(id),
        status             VARCHAR(50) NOT NULL,
        payment_status     VARCHAR(50) DEFAULT 'pending',
        shipping_status    VARCHAR(50) DEFAULT 'pending',
        subtotal           NUMERIC(14,2) DEFAULT 0,
        discount_total     NUMERIC(14,2) DEFAULT 0,
        shipping_total     NUMERIC(14,2) DEFAULT 0,
        tax_total          NUMERIC(14,2) DEFAULT 0,
        grand_total        NUMERIC(14,2) DEFAULT 0,
        placed_at          TIMESTAMP DEFAULT NOW(),
        created_at         TIMESTAMP DEFAULT NOW(),
        updated_at         TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE orders.order_items (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id            UUID    NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
        product_id          INTEGER NOT NULL REFERENCES pim.product(id),
        sku_snapshot        TEXT    NOT NULL,
        name_snapshot       TEXT    NOT NULL,
        qty                 NUMERIC(14,2) NOT NULL,
        unit_price_snapshot NUMERIC(14,2) NOT NULL,
        tax_snapshot        NUMERIC(14,2) DEFAULT 0,
        line_total          NUMERIC(14,2) NOT NULL,
        created_at          TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE orders.order_payments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id          UUID NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
        payment_method_id UUID REFERENCES commerce.payment_methods(id),
        provider          VARCHAR(150),
        amount            NUMERIC(14,2) NOT NULL,
        status            VARCHAR(50) NOT NULL,
        transaction_ref   VARCHAR(255),
        paid_at           TIMESTAMP NULL,
        created_at        TIMESTAMP DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: sales
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE sales.sales (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_number    VARCHAR(80) UNIQUE NOT NULL,
        source_type    VARCHAR(50) NOT NULL,
        order_id       UUID NULL REFERENCES orders.orders(id),
        customer_id    UUID NOT NULL,
        employee_id    UUID NULL,
        subtotal       NUMERIC(14,2) DEFAULT 0,
        discount_total NUMERIC(14,2) DEFAULT 0,
        tax_total      NUMERIC(14,2) DEFAULT 0,
        grand_total    NUMERIC(14,2) DEFAULT 0,
        payment_status VARCHAR(50),
        sale_status    VARCHAR(50),
        sold_at        TIMESTAMP DEFAULT NOW(),
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: billing
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE billing.invoices (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(80) UNIQUE NOT NULL,
        order_id       UUID NULL REFERENCES orders.orders(id),
        sale_id        UUID NULL REFERENCES sales.sales(id),
        customer_id    UUID NOT NULL,
        rfc            VARCHAR(20),
        legal_name     VARCHAR(255),
        subtotal       NUMERIC(14,2) DEFAULT 0,
        tax_total      NUMERIC(14,2) DEFAULT 0,
        grand_total    NUMERIC(14,2) DEFAULT 0,
        currency       VARCHAR(10) DEFAULT 'MXN',
        sat_status     VARCHAR(50),
        issue_date     TIMESTAMP DEFAULT NOW(),
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE billing.invoice_documents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id    UUID NOT NULL REFERENCES billing.invoices(id) ON DELETE CASCADE,
        document_type VARCHAR(20) NOT NULL,
        file_url      TEXT NOT NULL,
        checksum      VARCHAR(255),
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // SCHEMA: integrations
    // -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE integrations.api_clients (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        api_key    VARCHAR(64)  NOT NULL UNIQUE,
        is_active  BOOLEAN                  DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE integrations.import_jobs (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type          VARCHAR(100) NOT NULL,
        source_system     VARCHAR(150),
        status            VARCHAR(50) NOT NULL,
        started_at        TIMESTAMP,
        finished_at       TIMESTAMP,
        records_received  INT DEFAULT 0,
        records_processed INT DEFAULT 0,
        records_failed    INT DEFAULT 0,
        created_at        TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE integrations.import_job_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id       UUID NOT NULL REFERENCES integrations.import_jobs(id) ON DELETE CASCADE,
        level        VARCHAR(20),
        message      TEXT NOT NULL,
        payload_json JSONB,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    // -----------------------------------------------------
    // INDEXES
    // -----------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX idx_product_sku             ON pim.product(sku)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_filter_brand    ON pim.product(brand_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_filter_category ON pim.product(category_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_filter_autopart ON pim.product(auto_part_type_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_filter_provider ON pim.product(provider_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_filter_prov_sku ON pim.product(provider_sku)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_product_color_product   ON pim.product_color(id_product)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_products_image_product  ON pim.products_image(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_pxref_product_id        ON pim.product_cross_references(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_pxref_reference_sku     ON pim.product_cross_references(reference_sku)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_model_car_code_model    ON vehicles.model_car(code_model)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_model_car_code_plant    ON vehicles.model_car(code_assembly_plant)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_model_car_created_at    ON vehicles.model_car(created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_motorization_car_code   ON vehicles.motorization_car(code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_mcm_motorization_code   ON vehicles.model_car_motorization(motorization_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_mcm_model_car_code      ON vehicles.model_car_motorization(model_car_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_mcm_composite           ON vehicles.model_car_motorization(motorization_code, model_car_code)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_compat_sku               ON compatibility.compatibilities(sku)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_model_code        ON compatibility.compatibilities(model_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_year_code         ON compatibility.compatibilities(year_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_plant_code        ON compatibility.compatibilities(assembly_plant_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_motorization_code ON compatibility.compatibilities(motorization_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_model_year        ON compatibility.compatibilities(model_code, year_code)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_compat_sku_filters_code  ON compatibility.compatibilities(sku, model_code, year_code, assembly_plant_code, motorization_code) INCLUDE (id)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_inventory_product_id         ON inventory.inventory(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_inventory_provider_sku       ON inventory.inventory(provider_sku)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_inventory_product_branch     ON inventory.inventory(product_id, provider_branch_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_inventory_stock              ON inventory.inventory(product_id, stock)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_inventory_provider_branch_id ON inventory.inventory(provider_branch_id)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_price_list_items_pl   ON commerce.price_list_items(price_list_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_price_list_items_prod ON commerce.price_list_items(product_id)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_orders_customer       ON orders.orders(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_status         ON orders.orders(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_placed_at      ON orders.orders(placed_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_order_items_order     ON orders.order_items(order_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_order_items_product   ON orders.order_items(product_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_order_payments_order  ON orders.order_payments(order_id)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_sales_customer ON sales.sales(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_sales_sold_at  ON sales.sales(sold_at)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_invoices_customer ON billing.invoices(customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_invoices_order    ON billing.invoices(order_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_invoices_sale     ON billing.invoices(sale_id)`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_api_clients_api_key ON integrations.api_clients(api_key)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_import_job_logs_job ON integrations.import_job_logs(job_id)`,
    );

    // -----------------------------------------------------
    // TRIGGERS (set_updated_at)
    // -----------------------------------------------------
    await queryRunner.query(
      `CREATE TRIGGER trg_product_updated_at         BEFORE UPDATE ON pim.product                   FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_pxref_updated_at           BEFORE UPDATE ON pim.product_cross_references  FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_provider_branch_updated_at BEFORE UPDATE ON suppliers.provider_branch     FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_inventory_updated_at       BEFORE UPDATE ON inventory.inventory           FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_price_lists_updated_at     BEFORE UPDATE ON commerce.price_lists          FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_price_list_items_updated_at BEFORE UPDATE ON commerce.price_list_items    FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_orders_updated_at          BEFORE UPDATE ON orders.orders                 FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_sales_updated_at           BEFORE UPDATE ON sales.sales                   FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_invoices_updated_at        BEFORE UPDATE ON billing.invoices              FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_api_clients_updated_at     BEFORE UPDATE ON integrations.api_clients      FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS integrations  CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS billing       CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS sales         CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS orders        CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS commerce      CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS inventory     CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS compatibility CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS vehicles      CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS suppliers     CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS pim           CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS utils         CASCADE`);
  }
}
