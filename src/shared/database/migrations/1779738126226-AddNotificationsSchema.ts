import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationsSchema1779738126226 implements MigrationInterface {
  name = 'AddNotificationsSchema1779738126226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Datos de contacto congelados sobre el pedido.
    //
    //    Las columnas ship_to_* ya existen desde AddShippingSchema pero ningún
    //    DTO las escribía, así que están vacías en todas las filas. A partir de
    //    aquí se llenan al crear el pedido: los webhooks de Polar y Skydropx
    //    corren sin usuario y sin token, y sin esto no hay forma de saber a
    //    quién notificar. El contacto queda congelado en el documento.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_orders_ship_to_email ON orders.orders(ship_to_email)`,
    );

    // 2. Schema de notificaciones.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS notifications`);
    await queryRunner.query(
      `COMMENT ON SCHEMA notifications IS 'Avisos al cliente: feed in-app y bandeja de salida con reintentos por canal.'`,
    );

    await queryRunner.query(`
      CREATE TABLE notifications.notifications (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_user_id UUID NOT NULL,
        category          VARCHAR(50) NOT NULL,
        event_key         VARCHAR(80) NOT NULL,
        title             TEXT NOT NULL,
        body              TEXT,
        link              TEXT,
        entity_type       VARCHAR(50) NOT NULL,
        entity_id         UUID NOT NULL,
        dedupe_key        VARCHAR(200) NOT NULL UNIQUE,
        read_at           TIMESTAMP WITH TIME ZONE,
        created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE notifications.outbox (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID NOT NULL REFERENCES notifications.notifications(id) ON DELETE CASCADE,
        channel         VARCHAR(20) NOT NULL,
        destination     TEXT,
        status          VARCHAR(20) NOT NULL,
        attempts        INT NOT NULL DEFAULT 0,
        last_error      TEXT,
        next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        sent_at         TIMESTAMP WITH TIME ZONE,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        UNIQUE (notification_id, channel)
      )
    `);

    // El feed siempre se lee por destinatario, y el contador de no leídas filtra
    // read_at sobre ese mismo destinatario.
    await queryRunner.query(
      `CREATE INDEX idx_notifications_recipient_read ON notifications.notifications(recipient_user_id, read_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_notifications_created_at ON notifications.notifications(created_at DESC)`,
    );
    // El drenador busca exactamente por este par.
    await queryRunner.query(
      `CREATE INDEX idx_outbox_status_next_attempt ON notifications.outbox(status, next_attempt_at)`,
    );

    await queryRunner.query(
      `CREATE TRIGGER trg_notifications_outbox_updated_at BEFORE UPDATE ON notifications.outbox FOR EACH ROW EXECUTE FUNCTION utils.set_updated_at()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notifications_outbox_updated_at ON notifications.outbox`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS notifications.outbox`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications.notifications`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS notifications CASCADE`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS orders.idx_orders_ship_to_email`,
    );
  }
}
