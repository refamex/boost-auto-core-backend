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
import { Paginated, TaxonomyRow, bodyOf, rowsOf } from './typed-results';

/**
 * supertest declares `res.body` as `any`, and TypeORM declares `query()` as
 * `Promise<any>`. Both are narrowed once here instead of at ~50 call sites,
 * which is what let this file drift into 49 lint errors.
 */
interface PaginatedBody<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface TaxonomyRow {
  id: number;
  code?: string;
  name?: string;
  isActive: boolean;
}

const paged = (res: request.Response): PaginatedBody<TaxonomyRow> =>
  res.body as PaginatedBody<TaxonomyRow>;

/** Narrows a raw `dataSource.query()` result to the row shape it selected. */
const rows = <T>(result: unknown): T[] => result as T[];

/**
 * Phase 7: Integration Testing — PIM Pagination
 *
 * Verifies end-to-end that Phase 2 (PIM Pagination) and Phase 3 (Database Indexes)
 * work correctly together:
 * - Paginated endpoints return correct page metadata
 * - Filters (isActive) are applied correctly
 * - Indexes improve query performance
 * - Sorting works as expected (brands by name, categories/departments by code)
 */

describeWithDocker('PIM pagination (e2e) — Phase 7', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication<App>;

  const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

  const adminHeaders = (): Record<string, string> => ({
    'X-User-Id': ADMIN_ID,
    'X-Roles': 'pim:read,pim:write',
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

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
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  describe('GET /v1/brands', () => {
    beforeAll(async () => {
      // Seed brands for pagination testing (id column uses GENERATED ALWAYS AS IDENTITY)
      await dataSource.query(`
        INSERT INTO pim.brand (brand_code, name, is_active)
        VALUES
          ('BRAND-A', 'Alpha Brand', true),
          ('BRAND-B', 'Beta Brand', true),
          ('BRAND-C', 'Charlie Brand', true),
          ('BRAND-D', 'Delta Brand', true),
          ('BRAND-E', 'Echo Brand', false),
          ('BRAND-F', 'Foxtrot Brand', true)
      `);
    });

    it('returns first page with default limit (25)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res)).toMatchObject({
        items: expect.any(Array) as unknown[],
        total: 6,
        page: 1,
        limit: 25,
        pages: 1,
      });
      expect(paged(res).items).toHaveLength(6);
      // Verify sort order (ascending by name)
      expect(paged(res).items[0].name).toBe('Alpha Brand');
      expect(paged(res).items[1].name).toBe('Beta Brand');
    });

    it('applies custom page and limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?page=2&limit=2')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res)).toMatchObject({
        total: 6,
        page: 2,
        limit: 2,
        pages: 3,
      });
      expect(paged(res).items).toHaveLength(2);
      // Page 2 with limit 2 should skip first 2 items
      expect(paged(res).items[0].name).toBe('Charlie Brand');
    });

    it('filters by isActive=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?isActive=true')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res).total).toBe(5); // All except Echo Brand
      expect(paged(res).items.every((b) => b.isActive === true)).toBe(true);
    });

    it('filters by isActive=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?isActive=false')
        .set(adminHeaders())
        .expect(200);

      // At least Echo Brand should be inactive (may have more from previous tests)
      expect(paged(res).total).toBeGreaterThanOrEqual(1);
      const echoFound = paged(res).items.find((b) => b.name === 'Echo Brand');
      expect(echoFound).toBeDefined();
      expect(echoFound?.isActive).toBe(false);
    });

    it('returns empty page beyond total pages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?page=10&limit=10')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res)).toMatchObject({
        items: [],
        total: 6,
        page: 10,
        limit: 10,
        pages: 1,
      });
    });
  });

  describe('GET /v1/departments', () => {
    beforeAll(async () => {
      await dataSource.query(`
        INSERT INTO pim.category_department (code, department_name, is_active)
        VALUES
          ('DEPT-001', 'Auto Parts', true),
          ('DEPT-002', 'Electronics', true),
          ('DEPT-003', 'Accessories', false)
      `);
    });

    it('returns paginated departments sorted by code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/departments')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res).total).toBe(3);
      expect(paged(res).items[0].code).toBe('DEPT-001');
      expect(paged(res).items[1].code).toBe('DEPT-002');
      expect(paged(res).items[2].code).toBe('DEPT-003');
    });

    it('filters departments by isActive', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/departments?isActive=true')
        .set(adminHeaders())
        .expect(200);

      expect(paged(res).total).toBe(2);
      expect(paged(res).items.every((d) => d.isActive === true)).toBe(true);
    });
  });

  describe('Phase 3: Index Performance Verification', () => {
    it('executes paginated brand query with index', async () => {
      // Query with isActive filter should use idx_brand_active_name
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/brands?isActive=true&page=1&limit=10')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - startTime;

      // With proper index, query should be fast even on small dataset
      expect(duration).toBeLessThan(100); // <100ms is reasonable for indexed query
    });

    it('verifies indexes exist in database', async () => {
      const indexes = rows<{ indexname: string }>(
        await dataSource.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'pim'
          AND indexname IN (
            'idx_brand_active_name',
            'idx_category_active_code',
            'idx_category_department_id',
            'idx_department_active_code'
          )
        ORDER BY indexname
      `),
      );

      const indexNames = indexes.map((r) => r.indexname);

      expect(indexNames).toContain('idx_brand_active_name');
      expect(indexNames).toContain('idx_category_active_code');
      expect(indexNames).toContain('idx_category_department_id');
      expect(indexNames).toContain('idx_department_active_code');
    });
  });

  describe('Phase 6: Category Soft Delete', () => {
    let categoryId: number;

    beforeAll(async () => {
      // First insert department and get its id
      const deptResult = rows<{ id: number }>(
        await dataSource.query(`
        INSERT INTO pim.category_department (code, department_name, is_active)
        VALUES ('DEPT-100', 'Test Department', true)
        RETURNING id
      `),
      );
      const deptId = deptResult[0].id;

      // Then insert category with the department id
      const result = rows<{ id: number }>(
        await dataSource.query(
          `
        INSERT INTO pim.category (code, name, id_department, is_active)
        VALUES ('CAT-SOFT', 'Test Category for Soft Delete', $1, true)
        RETURNING id
      `,
          [deptId],
        ),
      );
      categoryId = result[0].id;
    });

    it('soft deletes category by setting isActive=false', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoryId}`)
        .set(adminHeaders())
        .expect(204); // DELETE returns 204 No Content

      // Verify category still exists but isActive=false
      const category = rows<{ id: number; code: string; is_active: boolean }>(
        await dataSource.query(
          `SELECT id, code, is_active FROM pim.category WHERE id = $1`,
          [categoryId],
        ),
      );

      expect(category).toHaveLength(1);
      expect(category[0].is_active).toBe(false);
      expect(category[0].code).toBe('CAT-SOFT');
    });

    it('soft-deleted categories can be filtered out with isActive=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?isActive=true')
        .set(adminHeaders())
        .expect(200);

      const softDeletedCategory = paged(res).items.find(
        (c) => c.id === categoryId,
      );

      expect(softDeletedCategory).toBeUndefined();
    });

    it('soft-deleted categories can be queried with isActive=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?isActive=false')
        .set(adminHeaders())
        .expect(200);

      const softDeletedCategory = paged(res).items.find(
        (c) => c.id === categoryId,
      );

      expect(softDeletedCategory).toBeDefined();
      expect(softDeletedCategory?.code).toBe('CAT-SOFT');
      expect(softDeletedCategory?.isActive).toBe(false);
    });
  });
});
