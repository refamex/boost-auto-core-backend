import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { describeWithDocker } from './docker-gate';
import { AllExceptionsFilter } from '../src/shared/common/filters/http-exception.filter';
import { DomainExceptionFilter } from '../src/shared/common/filters/domain-exception.filter';

/**
 * The order lifecycle, as a SEQUENCE.
 *
 * Every step here is already unit tested. What was never verified is that they
 * work one after another: that confirming reserves the stock the order will
 * need, that cancelling gives it back, that the history ends up describing what
 * actually happened. The audit asked for exactly this — "cobertura de login,
 * compra, pago, envío y administración" — and the seven existing e2e suites
 * cover migrations, pagination, constraints and performance. Pieces, not paths.
 *
 * Real Postgres, the real `AppModule`, the real guard and validation stack.
 * Mock auth (`X-User-Id`/`X-Roles`) stands in for JWKS, which is what lets a
 * shopper and a staff member be told apart without minting tokens.
 *
 * Skips locally without Docker; under CI it fails instead (see `docker-gate`).
 */

describeWithDocker('order lifecycle (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication<App>;

  let productId: number;
  let branchId: number;

  // `IsUUID()` defaults to version 'all', which also checks the variant nibble
  // — plain hex repeats fail it even though Postgres would accept them.
  const CUSTOMER = '11111111-1111-4111-8111-111111111111';
  const OTHER_CUSTOMER = '22222222-2222-4222-8222-222222222222';
  const STAFF = '33333333-3333-4333-8333-333333333333';

  const CATALOGUE_PRICE = 1500;
  const SEEDED_STOCK = 10;

  /** Exactly the two permissions the `customer` macro role expands to. */
  const buyer = (id = CUSTOMER): Record<string, string> => ({
    'X-User-Id': id,
    'X-Roles': 'orders:create,shipping:read',
    // Order creation requires a finished customer profile. The header is the
    // mock-auth stand-in for the `profile_complete` claim, and it fails closed,
    // so every shopper in this suite has to state it.
    'X-Profile-Complete': 'true',
  });

  const staff = (): Record<string, string> => ({
    'X-User-Id': STAFF,
    'X-Roles': 'orders:write,orders:admin,inventory:read',
  });

  const availableStock = async (): Promise<number> => {
    const [row] = await dataSource.query<Array<{ available: string }>>(
      `SELECT COALESCE(SUM(stock), 0) - COALESCE(SUM(reserved_stock), 0) AS available
         FROM inventory.inventory WHERE product_id = $1`,
      [productId],
    );
    return Number(row?.available ?? 0);
  };

  // Devuelve el `Test` de supertest, no una promesa: encadenar `.expect(201)`
  // en el call site es lo que hace legible cada paso del recorrido.
  const createOrder = (
    headers: Record<string, string>,
    body: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/v1/orders')
      .set(headers)
      .send({
        customerId: CUSTOMER,
        providerBranchId: branchId,
        items: [{ productId, qty: 1 }],
        ...body,
      });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getPort());
    process.env.DB_USER = container.getUsername();
    process.env.DB_PASS = container.getPassword();
    process.env.DB_NAME = container.getDatabase();
    process.env.DB_SSL = 'false';
    process.env.JWT_MODE = 'mock';
    process.env.NODE_ENV = 'test';

    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/shared/database/migrations/*.ts'],
      migrationsTableName: 'migrations',
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const [provider] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO suppliers.provider (name, code_identity)
       VALUES ('Rough Country', 'RC') RETURNING id`,
    );
    const [branch] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO suppliers.provider_branch
         (provider_id, branch_name, phone, address, city, postal_code, is_main_branch)
       VALUES ($1, 'HQ', '+1', '2450 Huish Rd', 'Dyersburg', '38024', TRUE)
       RETURNING id`,
      [provider.id],
    );
    branchId = Number(branch.id);

    const [product] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO pim.product (sku, name, price)
       VALUES ('LIFT-KIT-4IN', 'Lift kit 4 pulgadas', $1) RETURNING id`,
      [CATALOGUE_PRICE],
    );
    productId = Number(product.id);

    // Asserted rather than trusted: a seed that silently resolved nothing would
    // leave every id below undefined and the requests would fail far from here.
    expect(productId).toEqual(expect.any(Number));
    expect(branchId).toEqual(expect.any(Number));

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    // Mirrors bootstrap: without these, a DomainError surfaces as a 500 here
    // and as its real status in production.
    app.useGlobalFilters(
      new AllExceptionsFilter(),
      new DomainExceptionFilter(),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM orders.order_status_events');
    await dataSource.query('DELETE FROM orders.order_payments');
    await dataSource.query('DELETE FROM orders.order_items');
    await dataSource.query('DELETE FROM orders.orders');
    await dataSource.query('DELETE FROM inventory.inventory');
    await dataSource.query(
      `INSERT INTO inventory.inventory (product_id, provider_branch_id, stock, reserved_stock)
       VALUES ($1, $2, $3, 0)`,
      [productId, branchId, SEEDED_STOCK],
    );
  });

  /**
   * ONE test, not five.
   *
   * What is under test IS the sequence. Five independent cases sharing this
   * setup would verify five pieces again — which the unit suites already do —
   * while leaving the thing that has never been checked still unchecked.
   */
  it('carries an order from creation through payment, quoting and cancellation', async () => {
    // --- create -------------------------------------------------------------
    const created = await createOrder(buyer(), {
      // A stale cart price. Core resolves its own and only uses this to verify.
      items: [{ productId, qty: 2, unitPrice: CATALOGUE_PRICE }],
    }).expect(201);

    const order = created.body as {
      id: string;
      status: string;
      subtotal: number;
      grandTotal: number;
    };
    expect(order.status).toBe('draft');
    // The price came from the catalogue, not from the request body.
    expect(Number(order.subtotal)).toBe(CATALOGUE_PRICE * 2);
    expect(Number(order.grandTotal)).toBeGreaterThan(Number(order.subtotal));

    // --- confirm ------------------------------------------------------------
    const confirmed = await request(app.getHttpServer())
      .post(`/v1/orders/${order.id}/confirm`)
      .set(staff())
      .expect(201);
    expect((confirmed.body as { status: string }).status).toBe('confirmed');

    // The reservation is the point of confirming: without it two shoppers can
    // both buy the last unit.
    expect(await availableStock()).toBe(SEEDED_STOCK - 2);

    // --- pay ----------------------------------------------------------------
    await request(app.getHttpServer())
      .post(`/v1/orders/${order.id}/payments`)
      .set(staff())
      .send({ amount: order.grandTotal, status: 'paid' })
      .expect(201);

    // --- quote shipping -----------------------------------------------------
    // Reachable with `shipping:read` alone — the permission the customer role
    // expands to. The carrier itself is not configured here, so any answer
    // other than 403 proves the authorisation path, which is what F9 fixed.
    const quote = await request(app.getHttpServer())
      .post(`/v1/orders/${order.id}/shipping/quotes`)
      .set(buyer())
      .send({});
    expect(quote.status).not.toBe(403);

    // --- cancel -------------------------------------------------------------
    const cancelled = await request(app.getHttpServer())
      .post(`/v1/orders/${order.id}/cancel`)
      .set(staff())
      .expect(201);
    expect((cancelled.body as { status: string }).status).toBe('cancelled');

    // Cancelling a confirmed order has to give the stock back, or every
    // abandoned order strands inventory nobody can sell.
    expect(await availableStock()).toBe(SEEDED_STOCK);

    // --- the trail ----------------------------------------------------------
    // The history is the evidence the sequence happened, and in what order.
    const events = await request(app.getHttpServer())
      .get(`/v1/orders/${order.id}/status-events`)
      .set(staff())
      .expect(200);

    const trail = events.body as Array<{
      fromStatus: string | null;
      toStatus: string;
      actorId: string | null;
    }>;
    expect(trail.map((e) => e.toStatus)).toEqual([
      'draft',
      'confirmed',
      'cancelled',
    ]);
    expect(trail[0].fromStatus).toBeNull();
    expect(trail[1].actorId).toBe(STAFF);
  });

  /**
   * The landmine, and its defusal.
   *
   * A client that resolves prices on its own agrees with the server only by
   * luck. Today the luck holds because no migration seeds a default price list,
   * so `findApplicableOrNull` returns null and everything falls back to
   * `pim.product.price`. Creating one default list — which the API allows —
   * silently breaks every checkout that asserts a catalogue price.
   *
   * These tests seed exactly that list, so the failure is reproduced first and
   * the preview is shown to be the way out.
   */
  describe('price preview', () => {
    const LIST_PRICE = 1200;
    const BULK_PRICE = 900;
    const BULK_MIN_QTY = 5;

    let priceListId: string;
    let unpriceableProductId: number;

    const preview = (
      headers: Record<string, string>,
      body: Record<string, unknown> = {},
    ) =>
      request(app.getHttpServer())
        .post('/v1/orders/price-preview')
        .set(headers)
        .send({
          customerId: CUSTOMER,
          items: [{ productId, qty: 1 }],
          ...body,
        });

    beforeAll(async () => {
      const [product] = await dataSource.query<Array<{ id: number }>>(
        `INSERT INTO pim.product (sku, name, price)
         VALUES ('NO-PRICE-SKU', 'Producto sin precio', NULL) RETURNING id`,
      );
      unpriceableProductId = Number(product.id);
      expect(unpriceableProductId).toEqual(expect.any(Number));
    });

    // Seeded per test and torn down after, so the rest of the suite keeps
    // pricing off the catalogue — that is the state production is in today.
    beforeEach(async () => {
      const [list] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO commerce.price_lists (code, name, is_default)
         VALUES ('MAYOREO', 'Mayoreo', TRUE) RETURNING id`,
      );
      priceListId = list.id;

      await dataSource.query(
        `INSERT INTO commerce.price_list_items (price_list_id, product_id, price, min_qty)
         VALUES ($1, $2, $3, 1), ($1, $2, $4, $5)`,
        [priceListId, productId, LIST_PRICE, BULK_PRICE, BULK_MIN_QTY],
      );
    });

    afterEach(async () => {
      await dataSource.query('DELETE FROM commerce.price_list_items');
      await dataSource.query('DELETE FROM commerce.price_lists');
    });

    it('rejects a cart priced off the catalogue once a default list exists', async () => {
      // Exactly what the POS sends today: the catalogue price it displayed.
      const res = await createOrder(buyer(), {
        items: [{ productId, qty: 1, unitPrice: CATALOGUE_PRICE }],
      });

      expect(res.status).toBe(409);
    });

    it('quotes the list price and that quote creates the order', async () => {
      const quoted = await preview(buyer(), {
        items: [{ productId, qty: 2 }],
      }).expect(200);

      const body = quoted.body as {
        items: Array<{ productId: number; unitPrice: number; source: string }>;
        subtotal: number;
        grandTotal: number;
      };

      expect(body.items[0].source).toBe('price-list');
      expect(Number(body.items[0].unitPrice)).toBe(LIST_PRICE);
      expect(Number(body.subtotal)).toBe(LIST_PRICE * 2);

      // The whole point: what the preview quoted is what `create` accepts and
      // what the order ends up costing. No 409, and no second arithmetic.
      const created = await createOrder(buyer(), {
        items: [{ productId, qty: 2, unitPrice: body.items[0].unitPrice }],
      }).expect(201);

      const order = created.body as { subtotal: number; grandTotal: number };
      expect(Number(order.grandTotal)).toBe(Number(body.grandTotal));
      expect(Number(order.subtotal)).toBe(Number(body.subtotal));
    });

    /**
     * The tier the old client-side resolution ignored outright: it filtered on
     * validity only, so a wholesale break never applied and the cart showed
     * more than the server would charge.
     */
    it('applies the quantity tier the client-side resolution used to ignore', async () => {
      const below = await preview(buyer(), {
        items: [{ productId, qty: BULK_MIN_QTY - 1 }],
      }).expect(200);
      const atTier = await preview(buyer(), {
        items: [{ productId, qty: BULK_MIN_QTY }],
      }).expect(200);

      const priceOf = (res: { body: unknown }) =>
        Number(
          (res.body as { items: Array<{ unitPrice: number }> }).items[0]
            .unitPrice,
        );

      expect(priceOf(below)).toBe(LIST_PRICE);
      expect(priceOf(atTier)).toBe(BULK_PRICE);
    });

    /**
     * `create` answers 422 for an unpriceable line, which is right for creating
     * an order and useless for a cashier: it names no line. The preview reports
     * per line so the UI can point at the row to remove.
     */
    it('reports an unpriceable line instead of failing the whole cart', async () => {
      const res = await preview(buyer(), {
        items: [
          { productId, qty: 1 },
          { productId: unpriceableProductId, qty: 1 },
        ],
      }).expect(200);

      const body = res.body as {
        items: Array<{ productId: number; unitPrice: number; source: string }>;
        subtotal: number;
      };

      expect(body.items).toHaveLength(2);
      expect(body.items[1].source).toBe('unavailable');
      // Zero, and excluded from the total — an unpriceable line must never
      // read as a free one.
      expect(Number(body.items[1].unitPrice)).toBe(0);
      expect(Number(body.subtotal)).toBe(LIST_PRICE);
    });

    it('does not let a shopper price another shopper cart', async () => {
      await preview(buyer(OTHER_CUSTOMER)).expect(403);
    });

    it('refuses an asserted price, since a preview is not an order', async () => {
      // `forbidNonWhitelisted` is what keeps the two DTOs from blurring: the
      // preview says what it will charge, it does not verify a claim.
      await preview(buyer(), {
        items: [{ productId, qty: 1, unitPrice: 0.01 }],
      }).expect(400);
    });
  });

  describe('the paths that must fail', () => {
    it('does not let a shopper see another shopper orders', async () => {
      await createOrder(buyer()).expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/orders')
        .set(buyer(OTHER_CUSTOMER))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    /**
     * The vulnerability that was open until the server started pricing: the
     * cart lives in localStorage, so a cent was one edit away.
     */
    it('refuses an order that claims a price the catalogue does not agree with', async () => {
      const res = await createOrder(buyer(), {
        items: [{ productId, qty: 1, unitPrice: 0.01 }],
      });

      expect(res.status).toBe(409);

      const [{ count }] = await dataSource.query<Array<{ count: string }>>(
        'SELECT COUNT(*)::text AS count FROM orders.orders',
      );
      expect(Number(count)).toBe(0);
    });

    it('lets a shopper create an order but not confirm one', async () => {
      const created = await createOrder(buyer()).expect(201);

      await request(app.getHttpServer())
        .post(`/v1/orders/${(created.body as { id: string }).id}/confirm`)
        .set(buyer())
        .expect(403);
    });

    /**
     * THE one worth having. Reserving and moving to `confirmed` must be
     * atomic: an order left `confirmed` with no reservation is stock two
     * shoppers can both buy, and nothing downstream would notice.
     */
    it('leaves an order unconfirmed when there is not enough stock to reserve', async () => {
      const created = await createOrder(buyer(), {
        items: [{ productId, qty: SEEDED_STOCK + 5 }],
      }).expect(201);
      const id = (created.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .post(`/v1/orders/${id}/confirm`)
        .set(staff());
      expect(res.status).toBeGreaterThanOrEqual(400);

      const detail = await request(app.getHttpServer())
        .get(`/v1/orders/${id}`)
        .set(staff())
        .expect(200);
      expect((detail.body as { status: string }).status).not.toBe('confirmed');

      // And nothing was reserved on the way out.
      expect(await availableStock()).toBe(SEEDED_STOCK);
    });
  });
});
