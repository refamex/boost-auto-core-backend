import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomersSchema1779738126227 implements MigrationInterface {
  name = 'AddCustomersSchema1779738126227';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Schema de clientes comerciales.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS customers`);
    await queryRunner.query(
      `COMMENT ON SCHEMA customers IS 'Perfil comercial del cliente por rep de ventas y su libreta de direcciones (branches).'`,
    );

    // `auth_customer_id` es nullable: un rep puede registrar un prospecto antes
    // de que exista una identidad en autoboost-backend-auth, y vincularla
    // después (ver customer-link.ts). No hay FK cruzando servicios.
    //
    // Deliberadamente SIN los dos índices únicos parciales todavía
    // (uq_customer_profile_auth_customer_id, uq_customer_branch_main): la
    // fase 5 de tasks.md los agrega para que la prueba de integración los vea
    // fallar por la razón correcta antes de existir, no por un skip de Docker.
    await queryRunner.query(`
      CREATE TABLE customers.customer_profile (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_customer_id     UUID,
        owner_sales_rep_id   UUID,
        display_name         VARCHAR(150) NOT NULL,
        legal_name           VARCHAR(150),
        rfc                  VARCHAR(20),
        customer_type        VARCHAR(50),
        email                VARCHAR(150),
        phone                VARCHAR(40),
        notes                TEXT,
        is_active            BOOLEAN NOT NULL DEFAULT TRUE,
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    // Direcciones mapeadas 1:1 sobre el snapshot ship_to_* existente en
    // orders.orders, para que el follow-on de orders pueda copiar desde aquí
    // sin transformar formas. FK real (intra-servicio) contra el PK de
    // customer_profile.
    await queryRunner.query(`
      CREATE TABLE customers.customer_branch (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_profile_id  UUID NOT NULL REFERENCES customers.customer_profile(id) ON DELETE CASCADE,
        branch_name          VARCHAR(150),
        contact_person       VARCHAR(150),
        phone                VARCHAR(40),
        email                VARCHAR(150),
        recipient_name       VARCHAR(150),
        company              VARCHAR(150),
        street1              VARCHAR(255),
        postal_code          VARCHAR(20),
        area_level1          VARCHAR(120),
        area_level2          VARCHAR(120),
        area_level3          VARCHAR(120),
        country_code         VARCHAR(2) NOT NULL DEFAULT 'MX',
        is_main_branch       BOOLEAN NOT NULL DEFAULT FALSE,
        is_active            BOOLEAN NOT NULL DEFAULT TRUE,
        notes                TEXT,
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_customer_profile_owner_sales_rep_id ON customers.customer_profile(owner_sales_rep_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_customer_branch_profile_id ON customers.customer_branch(customer_profile_id)`,
    );

    await queryRunner.query(
      `CREATE TRIGGER trg_customer_profile_updated_at BEFORE UPDATE ON customers.customer_profile FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_customer_branch_updated_at BEFORE UPDATE ON customers.customer_branch FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_customer_branch_updated_at ON customers.customer_branch`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_customer_profile_updated_at ON customers.customer_profile`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS customers.customer_branch`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers.customer_profile`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS customers CASCADE`);
  }
}
