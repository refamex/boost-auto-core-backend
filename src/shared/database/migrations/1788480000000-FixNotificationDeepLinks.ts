import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs the deep links stored on existing notifications.
 *
 * WHAT THIS FIXES: `linkFor` used to stamp `/cuenta/pedido/:id` and
 * `/cuenta/facturas/:id` — Spanish paths no route in `boost-auto-client-app`
 * has ever served. The storefront routes are `/orders/:id` and
 * `/account/invoices`. Because `notifications.notifications.link` is written
 * once at creation and never recomputed, fixing `linkFor` only helped rows
 * created afterwards: every notification already in the table kept pointing at
 * a 404, which is exactly what a customer clicking their own order got.
 *
 * `NotificationService` now recomputes the link on every read, so the API is
 * already correct without this migration. This exists so the stored column
 * stops disagreeing with what the API returns — the table is read directly for
 * support and auditing, and a column full of dead paths is a trap for whoever
 * reads it next.
 *
 * The old paths carried the entity id, so both directions are derivable and
 * `down()` is a real inverse rather than a guess.
 */
export class FixNotificationDeepLinks1788480000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE notifications.notifications
         SET link = '/orders/' || entity_id
       WHERE link LIKE '/cuenta/pedido/%'
    `);

    // The invoice notification points at the list, not at one invoice: the
    // storefront has `/account/invoices` and no per-invoice route to land on.
    await queryRunner.query(`
      UPDATE notifications.notifications
         SET link = '/account/invoices'
       WHERE link LIKE '/cuenta/facturas/%'
    `);

    // A system alert references the stock-sync job type, not a customer
    // document, so no link is the honest value. This matches no rows today:
    // those alerts pass `entity_id = 'rough-country-stock'` into a UUID column,
    // the insert fails, and the emitter swallows the error — they have never
    // been persisted. Included so the backfill is already correct the day that
    // separate bug is fixed, not because it repairs anything now.
    await queryRunner.query(`
      UPDATE notifications.notifications
         SET link = NULL
       WHERE entity_type = 'stock_sync_job'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE notifications.notifications
         SET link = '/cuenta/pedido/' || entity_id
       WHERE link LIKE '/orders/%'
    `);

    await queryRunner.query(`
      UPDATE notifications.notifications
         SET link = '/cuenta/facturas/' || entity_id
       WHERE link = '/account/invoices'
    `);
  }
}
