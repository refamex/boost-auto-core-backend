import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El terreno para timbrar CFDI 4.0. NO timbra nada.
 *
 * QUE HABIA: `billing.invoices` guardaba `rfc`, `legal_name`, totales y un
 * `sat_status VARCHAR(50)` sin un solo lector ni escritor en todo el codigo.
 * Ni un campo del CFDI existia: ni UUID fiscal, ni sello, ni certificado, ni
 * uso CFDI, ni codigo postal fiscal del receptor.
 *
 * POR QUE SE AGREGA SIN INTEGRAR UN PAC: timbrar exige un PAC contratado y los
 * certificados CSD del SAT, que son decisiones comerciales, no de codigo. Lo
 * que si se puede cerrar hoy es todo lo que un PAC va a necesitar el dia que
 * exista: las columnas, la captura fiscal que falta, y los estados de
 * cancelacion. El adaptador es entonces UNA pieza, no un rediseno.
 *
 * SIN BACKFILL, A PROPOSITO. Ninguna factura existente fue timbrada. Rellenar
 * `sat_status` con 'vigente' inventaria un hecho fiscal.
 */
export class AddCfdiFields1788566400000 implements MigrationInterface {
  name = 'AddCfdiFields1788566400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- El comprobante ---------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE billing.invoices
        ADD COLUMN cfdi_version               VARCHAR(10),
        ADD COLUMN tipo_comprobante           VARCHAR(5),
        ADD COLUMN serie                      VARCHAR(25),
        ADD COLUMN folio                      VARCHAR(40),
        ADD COLUMN uuid_fiscal                UUID,
        ADD COLUMN fecha_timbrado             TIMESTAMPTZ,
        ADD COLUMN sello_cfd                  TEXT,
        ADD COLUMN sello_sat                  TEXT,
        ADD COLUMN no_certificado_emisor      VARCHAR(20),
        ADD COLUMN no_certificado_sat         VARCHAR(20),
        ADD COLUMN cadena_original_sat        TEXT,
        ADD COLUMN forma_pago                 VARCHAR(3),
        ADD COLUMN metodo_pago                VARCHAR(6),
        ADD COLUMN uso_cfdi                   VARCHAR(5),
        ADD COLUMN regimen_fiscal_emisor      VARCHAR(5),
        ADD COLUMN regimen_fiscal_receptor    VARCHAR(5),
        ADD COLUMN domicilio_fiscal_receptor  VARCHAR(10)
    `);

    // El UUID fiscal es unico en todo el SAT. Un duplicado en nuestra tabla
    // significa que se registro dos veces el mismo timbre, y es mejor que la
    // base lo rechace a que dos facturas afirmen ser la misma.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_invoices_uuid_fiscal
        ON billing.invoices(uuid_fiscal)
        WHERE uuid_fiscal IS NOT NULL
    `);

    // --- Cancelacion ------------------------------------------------------
    // El SAT no borra: sustituye. `uuid_sustitucion` es la factura que reemplaza
    // a esta, y sin esa columna una cancelacion con sustitucion no se puede
    // ni registrar.
    await queryRunner.query(`
      ALTER TABLE billing.invoices
        ADD COLUMN cancel_status    VARCHAR(30),
        ADD COLUMN cancel_motivo    VARCHAR(3),
        ADD COLUMN uuid_sustitucion UUID,
        ADD COLUMN cancelled_at     TIMESTAMPTZ
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN billing.invoices.sat_status IS 'Estado ante el SAT: NULL = nunca timbrada. No se rellena por defecto.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN billing.invoices.cancel_motivo IS 'Clave del catalogo SAT c_MotivoCancelacion (01..04). 01 exige uuid_sustitucion.'`,
    );

    // --- Datos fiscales del receptor --------------------------------------
    // `tax_regime` existia SOLO en autoboost-auth y `rfc` estaba duplicado
    // entre los dos servicios sin sincronizar. El uso CFDI y el codigo postal
    // fiscal no existian en ninguna parte, y los dos son obligatorios en 4.0.
    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
        ADD COLUMN tax_regime          VARCHAR(5),
        ADD COLUMN uso_cfdi_default    VARCHAR(5),
        ADD COLUMN fiscal_postal_code  VARCHAR(10)
    `);

    // --- Claves SAT por producto ------------------------------------------
    // Un CFDI exige ClaveProdServ y ClaveUnidad POR CONCEPTO. Nullable porque
    // poblar 7.878 productos es trabajo de datos, no de codigo — pero sin ellas
    // no se timbra, aunque el PAC este contratado.
    await queryRunner.query(`
      ALTER TABLE pim.product
        ADD COLUMN clave_prod_serv VARCHAR(8),
        ADD COLUMN clave_unidad    VARCHAR(3)
    `);
    await queryRunner.query(
      `COMMENT ON COLUMN pim.product.clave_prod_serv IS 'Catalogo SAT c_ClaveProdServ. Obligatoria para timbrar; hay que poblarla.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pim.product
        DROP COLUMN clave_unidad,
        DROP COLUMN clave_prod_serv
    `);
    await queryRunner.query(`
      ALTER TABLE customers.customer_profile
        DROP COLUMN fiscal_postal_code,
        DROP COLUMN uso_cfdi_default,
        DROP COLUMN tax_regime
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS billing.uq_invoices_uuid_fiscal`,
    );
    await queryRunner.query(`
      ALTER TABLE billing.invoices
        DROP COLUMN cancelled_at,
        DROP COLUMN uuid_sustitucion,
        DROP COLUMN cancel_motivo,
        DROP COLUMN cancel_status,
        DROP COLUMN domicilio_fiscal_receptor,
        DROP COLUMN regimen_fiscal_receptor,
        DROP COLUMN regimen_fiscal_emisor,
        DROP COLUMN uso_cfdi,
        DROP COLUMN metodo_pago,
        DROP COLUMN forma_pago,
        DROP COLUMN cadena_original_sat,
        DROP COLUMN no_certificado_sat,
        DROP COLUMN no_certificado_emisor,
        DROP COLUMN sello_sat,
        DROP COLUMN sello_cfd,
        DROP COLUMN fecha_timbrado,
        DROP COLUMN uuid_fiscal,
        DROP COLUMN folio,
        DROP COLUMN serie,
        DROP COLUMN tipo_comprobante,
        DROP COLUMN cfdi_version
    `);
  }
}
