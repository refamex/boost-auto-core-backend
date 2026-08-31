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

/**
 * Los conteos por faceta, contra Postgres real.
 *
 * Se prueba acá y no con un doble del query builder porque lo que puede estar
 * mal es el SQL: qué `WHERE` entra en cada `GROUP BY`. Un test que afirma sobre
 * las llamadas a `andWhere` verifica el mock, no el número que ve el comprador.
 *
 * Skips locally without Docker; under CI it fails instead (see `docker-gate`).
 */

describeWithDocker('product facets (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication<App>;

  const SHOPPER = '11111111-1111-4111-8111-111111111111';
  const shopper = (): Record<string, string> => ({
    'X-User-Id': SHOPPER,
    'X-Roles': 'orders:create,shipping:read',
  });

  const ids = {
    brandRC: 0,
    brandFox: 0,
    catSuspension: 0,
    catFrenos: 0,
    partAmortiguador: 0,
    partBalata: 0,
  };

  interface Facets {
    brands: { id: number; count: number }[];
    categories: { id: number; count: number }[];
    autoParts: { id: number; count: number }[];
  }

  const facets = (query = ''): request.Test =>
    request(app.getHttpServer())
      .get(`/v1/products/facets${query}`)
      .set(shopper());

  const countFor = (rows: { id: number; count: number }[], id: number) =>
    rows.find((r) => r.id === id)?.count ?? 0;

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

    const one = async (sql: string, params: unknown[] = []) => {
      const [row] = await dataSource.query<Array<{ id: number }>>(sql, params);
      return Number(row.id);
    };

    const departmentId = await one(
      `INSERT INTO pim.category_department (code, department_name)
       VALUES ('REF', 'Refacciones') RETURNING id`,
    );

    ids.brandRC = await one(
      `INSERT INTO pim.brand (name) VALUES ('Rough Country') RETURNING id`,
    );
    ids.brandFox = await one(
      `INSERT INTO pim.brand (name) VALUES ('Fox') RETURNING id`,
    );
    ids.catSuspension = await one(
      `INSERT INTO pim.category (name, code, id_department)
       VALUES ('Suspensión', 'SUSP', $1) RETURNING id`,
      [departmentId],
    );
    ids.catFrenos = await one(
      `INSERT INTO pim.category (name, code, id_department)
       VALUES ('Frenos', 'FREN', $1) RETURNING id`,
      [departmentId],
    );
    ids.partAmortiguador = await one(
      `INSERT INTO pim.auto_part_catalog (name) VALUES ('Amortiguador') RETURNING id`,
    );
    ids.partBalata = await one(
      `INSERT INTO pim.auto_part_catalog (name) VALUES ('Balata') RETURNING id`,
    );

    // Un reparto deliberado, no relleno. Fox NO tiene nada en Frenos: ese hueco
    // es el que prueba que una categoría se apague sin apagar su propia faceta.
    //
    //            Suspensión          Frenos
    //   RC       2 amortiguadores    1 balata
    //   Fox      1 amortiguador      —
    const product = async (
      sku: string,
      brandId: number,
      categoryId: number,
      autoPartTypeId: number,
    ): Promise<void> => {
      await dataSource.query(
        `INSERT INTO pim.product (sku, name, price, brand_id, category_id, auto_part_type_id, is_visible)
         VALUES ($1, $1, 100, $2, $3, $4, TRUE)`,
        [sku, brandId, categoryId, autoPartTypeId],
      );
    };

    await product(
      'RC-SUSP-1',
      ids.brandRC,
      ids.catSuspension,
      ids.partAmortiguador,
    );
    await product(
      'RC-SUSP-2',
      ids.brandRC,
      ids.catSuspension,
      ids.partAmortiguador,
    );
    await product('RC-FREN-1', ids.brandRC, ids.catFrenos, ids.partBalata);
    await product(
      'FOX-SUSP-1',
      ids.brandFox,
      ids.catSuspension,
      ids.partAmortiguador,
    );

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
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('counts every option when nothing is filtered', async () => {
    const res = await facets().expect(200);
    const body = res.body as Facets;

    expect(countFor(body.brands, ids.brandRC)).toBe(3);
    expect(countFor(body.brands, ids.brandFox)).toBe(1);
    expect(countFor(body.categories, ids.catSuspension)).toBe(3);
    expect(countFor(body.categories, ids.catFrenos)).toBe(1);
  });

  /**
   * LA prueba de este archivo.
   *
   * Contar las marcas bajo el filtro de marca dejaría a la elegida con su
   * número y a todas las demás en cero: el comprador entra a una marca y no
   * puede salir. Cada faceta se cuenta bajo las *otras*, nunca bajo la propia.
   */
  it('does not count a facet under its own filter', async () => {
    const res = await facets(`?brandId=${ids.brandRC}`).expect(200);
    const body = res.body as Facets;

    // Fox sigue elegible con su conteo intacto, aunque el filtro sea RC.
    expect(countFor(body.brands, ids.brandFox)).toBe(1);
    expect(countFor(body.brands, ids.brandRC)).toBe(3);

    // Y las otras facetas SÍ se estrechan: son las que le dicen al comprador
    // qué le queda dentro de la marca que eligió.
    expect(countFor(body.categories, ids.catSuspension)).toBe(2);
    expect(countFor(body.categories, ids.catFrenos)).toBe(1);
  });

  it('drops an option to zero when the other filters exclude it', async () => {
    const res = await facets(`?brandId=${ids.brandFox}`).expect(200);
    const body = res.body as Facets;

    // Fox no tiene frenos: la categoría desaparece del conteo, que es lo que
    // el storefront lee como "apagá esta opción".
    expect(countFor(body.categories, ids.catFrenos)).toBe(0);
    expect(countFor(body.categories, ids.catSuspension)).toBe(1);

    // Pero la marca no se estrecha a sí misma.
    expect(countFor(body.brands, ids.brandRC)).toBe(3);
  });

  it('narrows on free text the same way the listing does', async () => {
    const res = await facets('?q=SUSP').expect(200);
    const body = res.body as Facets;

    expect(countFor(body.brands, ids.brandRC)).toBe(2);
    expect(countFor(body.brands, ids.brandFox)).toBe(1);
    expect(countFor(body.categories, ids.catFrenos)).toBe(0);
  });

  /**
   * El contrato con la pantalla: el conteo de una opción tiene que ser el total
   * que devuelve el listado al elegirla. Si difieren, el número es una promesa
   * que la siguiente pantalla incumple.
   */
  it('agrees with the listing it promises', async () => {
    const res = await facets().expect(200);
    const promised = countFor(
      (res.body as Facets).categories,
      ids.catSuspension,
    );

    const listed = await request(app.getHttpServer())
      .get(`/v1/products?categoryId=${ids.catSuspension}`)
      .set(shopper())
      .expect(200);

    expect((listed.body as { total: number }).total).toBe(promised);
  });
});
