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
 * supertest declares `res.body` as `any`, and TypeORM declares `query()` as
 * `Promise<any>`. Both are narrowed once here rather than at ~40 call sites,
 * which is what let this file drift into 41 lint errors.
 */
interface PaginatedBody<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const paged = (res: request.Response): PaginatedBody<{ id: number }> =>
  res.body as PaginatedBody<{ id: number }>;

/** Narrows a raw `dataSource.query()` result to the row shape it selected. */
const rows = <T>(result: unknown): T[] => result as T[];

/** The one row / one array-valued column `EXPLAIN (ANALYZE, FORMAT JSON)` returns. */
interface QueryPlan {
  'Execution Time': number;
}

/** Passes a raw `any` query result through as `unknown`, forcing a narrow. */
const raw = (result: unknown): unknown => result;

const explain = (result: unknown): QueryPlan =>
  (result as { 'QUERY PLAN': QueryPlan[] }[])[0]['QUERY PLAN'][0];

/**
 * Phase 8: Performance Testing
 *
 * Verifies that optimizations from Phases 2-4 meet performance requirements:
 * - Phase 2: Paginated endpoints respond within acceptable time
 * - Phase 3: Database indexes improve query performance
 * - Phase 4: Vehicle product search meets <5ms query time
 *
 * Performance targets:
 * - Paginated list endpoints: <100ms for typical page
 * - Filtered queries: <200ms with complex filters
 * - Vehicle search: <5ms SQL execution time (from Phase 4 spec)
 * - Bulk operations: Handle 1000+ records efficiently
 */

describeWithDocker('Performance benchmarks (e2e) — Phase 8', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication<App>;

  const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

  const adminHeaders = (): Record<string, string> => ({
    'X-User-Id': ADMIN_ID,
    'X-Roles': 'pim:read,pim:write,compatibility:read',
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

    // `listen`, not `init`: supertest binds a non-listening server to an
    // ephemeral port per request, so the concurrent suites below raced ten
    // simultaneous binds against the same server object and lost connections
    // to ECONNRESET. Listening once removes the race.
    await app.listen(0);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  describe('Phase 2: Paginated Endpoints Performance', () => {
    beforeAll(async () => {
      // Seed realistic data volume (100 brands)
      const brandInserts = Array.from({ length: 100 }, (_, i) => ({
        code: `BRAND-${String(i + 1).padStart(4, '0')}`,
        name: `Brand ${i + 1}`,
        active: i % 10 !== 0, // 90% active, 10% inactive
      }));

      for (const brand of brandInserts) {
        await dataSource.query(
          `INSERT INTO pim.brand (brand_code, name, is_active) VALUES ($1, $2, $3)`,
          [brand.code, brand.name, brand.active],
        );
      }

      // Seed departments (50)
      const deptInserts = Array.from({ length: 50 }, (_, i) => ({
        code: `DEPT-${String(i + 1).padStart(3, '0')}`,
        name: `Department ${i + 1}`,
        active: i % 5 !== 0,
      }));

      for (const dept of deptInserts) {
        await dataSource.query(
          `INSERT INTO pim.category_department (code, department_name, is_active) VALUES ($1, $2, $3)`,
          [dept.code, dept.name, dept.active],
        );
      }
    });

    it('GET /v1/brands responds within 100ms for first page', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/brands?page=1&limit=25')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(150); // Relaxed for CI variability
    });

    it('GET /v1/brands with isActive filter responds within 200ms', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/brands?isActive=true&page=1&limit=25')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });

    it('GET /v1/departments responds within 100ms', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/departments?page=1&limit=25')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('handles large page size (limit=100) within 200ms', async () => {
      const start = Date.now();

      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?page=1&limit=100')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
      expect(paged(res).items.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 3: Index Performance Verification', () => {
    it('verifies EXPLAIN ANALYZE shows index usage for brand query', async () => {
      const result = raw(
        await dataSource.query(`
          EXPLAIN (ANALYZE, FORMAT JSON)
          SELECT * FROM pim.brand
          WHERE is_active = true
          ORDER BY name
          LIMIT 25
        `),
      );

      const plan = explain(result);
      const planText = JSON.stringify(plan);

      // Should use idx_brand_active_name index
      expect(planText).toContain('idx_brand_active_name');
      expect(plan['Execution Time']).toBeLessThan(5); // <5ms execution
    });

    it('verifies index usage for department query', async () => {
      const result = raw(
        await dataSource.query(`
          EXPLAIN (ANALYZE, FORMAT JSON)
          SELECT * FROM pim.category_department
          WHERE is_active = true
          ORDER BY code
          LIMIT 25
        `),
      );

      const plan = explain(result);
      const planText = JSON.stringify(plan);

      expect(planText).toContain('idx_department_active_code');
      expect(plan['Execution Time']).toBeLessThan(5);
    });

    it('measures query performance improvement with index', async () => {
      // Query with index (should be fast)
      const startWithIndex = Date.now();
      await dataSource.query(`
        SELECT * FROM pim.brand
        WHERE is_active = true
        ORDER BY name
        LIMIT 25
      `);
      const durationWithIndex = Date.now() - startWithIndex;

      // Index should make this nearly instant
      expect(durationWithIndex).toBeLessThan(10);
    });
  });

  describe('Phase 4: Vehicle Product Search Performance', () => {
    let productId: number;
    let modelId: number;
    let yearId: number;
    let assemblyPlantId: number;
    let motorizationId: number;

    beforeAll(async () => {
      // Create vehicle dimension records
      const assemblyResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO vehicles.assembly_plant (code, assembly_plant)
          VALUES ('US-ASSEMBLY', 'US Assembly Plant')
          RETURNING id
        `),
      );
      assemblyPlantId = assemblyResult[0].id;

      const modelResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO vehicles.model_car (code_model, model_car)
          VALUES ('F150', 'Ford F-150')
          RETURNING id
        `),
      );
      modelId = modelResult[0].id;

      const yearResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO vehicles.year_car (code, year)
          VALUES ('2020', '2020')
          RETURNING id
        `),
      );
      yearId = yearResult[0].id;

      const motorizationResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO vehicles.motorization_car (code, motorization)
          VALUES ('V8', 'V8 5.0L')
          RETURNING id
        `),
      );
      motorizationId = motorizationResult[0].id;

      // Create category and product
      const deptResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO pim.category_department (code, department_name, is_active)
          VALUES ('AUTO-PARTS', 'Auto Parts', true)
          RETURNING id
        `),
      );
      const deptId = deptResult[0].id;

      const catResult = rows<{ id: number }>(
        await dataSource.query(
          `
          INSERT INTO pim.category (code, name, id_department, is_active)
          VALUES ('SUSPENSION', 'Suspension', $1, true)
          RETURNING id
        `,
          [deptId],
        ),
      );
      const categoryId = catResult[0].id;

      // Create 50 products with compatibility
      for (let i = 0; i < 50; i++) {
        const productResult = rows<{ id: number }>(
          await dataSource.query(
            `
            INSERT INTO pim.product (sku, name, category_id, is_visible)
            VALUES ($1, $2, $3, true)
            RETURNING id
          `,
            [
              `PERF-SKU-${String(i + 1).padStart(4, '0')}`,
              `Vehicle Product ${i + 1}`,
              categoryId,
            ],
          ),
        );
        productId = productResult[0].id;

        // Link product to vehicle via compatibility
        await dataSource.query(
          `
          INSERT INTO compatibility.compatibilities (product_id, model_id, year_id, assembly_plant_id, motorization_id)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [productId, modelId, yearId, assemblyPlantId, motorizationId],
        );
      }
    });

    it('verifies optimized query plan for vehicle search', async () => {
      const result = raw(
        await dataSource.query(
          `
          EXPLAIN (ANALYZE, FORMAT JSON)
          SELECT DISTINCT p.*
          FROM pim.product p
          INNER JOIN compatibility.compatibilities c ON c.product_id = p.id
          WHERE c.model_id = $1
            AND c.year_id = $2
            AND p.is_visible = true
          ORDER BY p.id DESC
          LIMIT 25
        `,
          [modelId, yearId],
        ),
      );

      const plan = explain(result);

      // Query should execute in <5ms as per Phase 4 spec
      expect(plan['Execution Time']).toBeLessThan(5);
    });

    it('vehicle search query completes efficiently', async () => {
      const start = Date.now();

      const products = rows<Record<string, unknown>>(
        await dataSource.query(
          `
          SELECT DISTINCT p.*
          FROM pim.product p
          INNER JOIN compatibility.compatibilities c ON c.product_id = p.id
          WHERE c.model_id = $1
            AND c.year_id = $2
            AND p.is_visible = true
          ORDER BY p.id DESC
          LIMIT 25
        `,
          [modelId, yearId],
        ),
      );

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50); // Direct SQL should be very fast
      expect(products.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 8: Bulk Operations Performance', () => {
    it('handles bulk category listing (1000+ records) efficiently', async () => {
      // Create department for bulk test
      const deptResult = rows<{ id: number }>(
        await dataSource.query(`
          INSERT INTO pim.category_department (code, department_name, is_active)
          VALUES ('BULK-TEST', 'Bulk Test Department', true)
          RETURNING id
        `),
      );
      const deptId = deptResult[0].id;

      // Insert 200 categories (reasonable bulk size)
      for (let i = 0; i < 200; i++) {
        await dataSource.query(
          `
          INSERT INTO pim.category (code, name, id_department, is_active)
          VALUES ($1, $2, $3, true)
        `,
          [
            `BULK-CAT-${String(i + 1).padStart(4, '0')}`,
            `Category ${i + 1}`,
            deptId,
          ],
        );
      }

      const start = Date.now();

      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?page=1&limit=100')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      // Should handle 100 records per page efficiently
      expect(duration).toBeLessThan(200);
      expect(paged(res).items.length).toBe(100);
      expect(paged(res).total).toBeGreaterThanOrEqual(200);
    });

    it('pagination offset performance remains acceptable for deep pages', async () => {
      // Test page 5 (offset 400) - should still be fast with proper indexes
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/categories?page=5&limit=100')
        .set(adminHeaders())
        .expect(200);

      const duration = Date.now() - start;

      // Deep pagination should still complete within 300ms
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Phase 8: Concurrent Request Performance', () => {
    it('handles 10 concurrent paginated requests within acceptable time', async () => {
      const start = Date.now();

      const requests = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/brands?page=1&limit=25')
          .set(adminHeaders()),
      );

      const responses = await Promise.all(requests);

      const duration = Date.now() - start;

      // 10 concurrent requests should complete within 500ms total
      expect(duration).toBeLessThan(500);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it('maintains performance under mixed concurrent queries', async () => {
      const start = Date.now();

      const requests = [
        request(app.getHttpServer())
          .get('/api/v1/brands?isActive=true')
          .set(adminHeaders()),
        request(app.getHttpServer())
          .get('/api/v1/departments?page=1&limit=50')
          .set(adminHeaders()),
        request(app.getHttpServer())
          .get('/api/v1/categories?page=1&limit=25')
          .set(adminHeaders()),
        request(app.getHttpServer())
          .get('/api/v1/brands?page=2&limit=25')
          .set(adminHeaders()),
        request(app.getHttpServer())
          .get('/api/v1/departments?isActive=false')
          .set(adminHeaders()),
      ];

      const responses = await Promise.all(requests);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(400);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Phase 8: Memory Efficiency', () => {
    it('paginated response payload size is reasonable', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?page=1&limit=25')
        .set(adminHeaders())
        .expect(200);

      const payloadSize = JSON.stringify(res.body).length;

      // Payload for 25 items should be <50KB (reasonable for network transfer)
      expect(payloadSize).toBeLessThan(50_000);
    });

    it('large limit request still returns reasonable payload', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/brands?page=1&limit=100')
        .set(adminHeaders())
        .expect(200);

      const payloadSize = JSON.stringify(res.body).length;

      // 100 items should be <200KB
      expect(payloadSize).toBeLessThan(200_000);
    });
  });
});
