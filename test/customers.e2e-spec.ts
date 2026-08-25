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
 * Drives the `customers` HTTP surface end to end against a real Postgres and
 * the actual `ValidationPipe`/guard stack — the only place D2's rep/admin
 * visibility tiers, D7's 400-on-body-ownership, and admin-only reassignment
 * are provable together, rather than through mocked-repository unit tests.
 * Mock auth (`X-User-Id`/`X-Roles`/`X-Sales-Rep-Id`) stands in for JWKS.
 * Skips locally without Docker; under CI it fails instead (see `docker-gate`).
 */

describeWithDocker('customers API (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication<App>;

  // class-validator's IsUUID() defaults to version 'all', which additionally
  // requires a valid variant nibble (8/9/a/b in the 4th group) — plain hex
  // repeats like '...-2222-2222-...' fail that check even though Postgres's
  // UUID column type itself accepts any 8-4-4-4-12 hex string.
  const REP_1 = '11111111-1111-4111-8111-111111111111';
  const REP_2 = '22222222-2222-4222-8222-222222222222';
  const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

  const repHeaders = (repId: string): Record<string, string> => ({
    'X-User-Id': repId,
    'X-Roles': 'customers:read,customers:write',
    'X-Sales-Rep-Id': repId,
  });

  const adminHeaders = (): Record<string, string> => ({
    'X-User-Id': ADMIN_ID,
    'X-Roles': 'customers:read,customers:write,customers:admin',
  });

  const createProfile = async (
    repId: string,
    displayName: string,
  ): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/v1/customers')
      .set(repHeaders(repId))
      .send({ displayName })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    // Migrations run against the container up front, mirroring how
    // migrationsRun: false works in production (a deploy step runs them
    // separately from app boot) — see app.module.ts's TypeOrmModule config.
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/shared/database/migrations/*.ts'],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    // Set BEFORE importing AppModule so ConfigModule/Joi validate against
    // the ephemeral container, never the repo's real DB_HOST — this worktree
    // has no committed .env, and the deployed database is off-limits.
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getPort());
    process.env.DB_USER = container.getUsername();
    process.env.DB_PASS = container.getPassword();
    process.env.DB_NAME = container.getDatabase();
    process.env.DB_SSL = 'false';
    process.env.JWT_MODE = 'mock';
    process.env.NODE_ENV = 'test';

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

  beforeEach(async () => {
    await dataSource.query('DELETE FROM customers.customer_branch');
    await dataSource.query('DELETE FROM customers.customer_profile');
  });

  it('rep sees only its own portfolio, with no salesRepId query param', async () => {
    await createProfile(REP_1, 'Rep1 Customer A');
    await createProfile(REP_1, 'Rep1 Customer B');
    await createProfile(REP_2, 'Rep2 Customer C');

    const res = await request(app.getHttpServer())
      .get('/v1/customers')
      .set(repHeaders(REP_1))
      .expect(200);

    const names = (res.body as { items: { displayName: string }[] }).items
      .map((c) => c.displayName)
      .sort();
    expect(names).toEqual(['Rep1 Customer A', 'Rep1 Customer B']);
  });

  it('rep requesting a foreign customer gets 404, never 403', async () => {
    const foreignId = await createProfile(REP_2, 'Rep2 Only');

    await request(app.getHttpServer())
      .get(`/v1/customers/${foreignId}`)
      .set(repHeaders(REP_1))
      .expect(404);
  });

  it('rejects ownerSalesRepId in the create body with 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/customers')
      .set(repHeaders(REP_1))
      .send({
        displayName: 'Attempted Body Override',
        ownerSalesRepId: REP_2,
      })
      .expect(400);

    const rows = await dataSource.query<{ n: number }[]>(
      "SELECT count(*)::int AS n FROM customers.customer_profile WHERE display_name = 'Attempted Body Override'",
    );
    expect(rows[0].n).toBe(0);
  });

  it('rejects a non-admin reassignment attempt', async () => {
    const id = await createProfile(REP_1, 'Owned By Rep1');

    await request(app.getHttpServer())
      .patch(`/v1/customers/${id}/owner`)
      .set(repHeaders(REP_1))
      .send({ ownerSalesRepId: REP_2 })
      .expect(403);

    const res = await request(app.getHttpServer())
      .get(`/v1/customers/${id}`)
      .set(repHeaders(REP_1))
      .expect(200);
    expect((res.body as { ownerSalesRepId: string }).ownerSalesRepId).toBe(
      REP_1,
    );
  });

  it('allows an admin to reassign ownership, moving visibility to the new owner', async () => {
    const id = await createProfile(REP_1, 'Owned By Rep1');

    const res = await request(app.getHttpServer())
      .patch(`/v1/customers/${id}/owner`)
      .set(adminHeaders())
      .send({ ownerSalesRepId: REP_2 })
      .expect(200);
    expect((res.body as { ownerSalesRepId: string }).ownerSalesRepId).toBe(
      REP_2,
    );

    await request(app.getHttpServer())
      .get(`/v1/customers/${id}`)
      .set(repHeaders(REP_1))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/customers/${id}`)
      .set(repHeaders(REP_2))
      .expect(200);
  });
});
