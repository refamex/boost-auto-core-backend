import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

/**
 * Supertest types `res.body` as `any`, and `DataSource.query` resolves to
 * `any` too, so every assertion reached through either one trips the
 * `no-unsafe-*` rules that `recommendedTypeChecked` turns on. Narrow both
 * once here rather than casting at each of the ~90 call sites across the
 * e2e suites.
 */

/** Mirrors `paginated()` in `src/shared/common/pagination/pagination.dto.ts`. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** The columns the PIM suites actually read off a taxonomy row. */
export interface TaxonomyRow {
  id: number;
  code: string;
  name?: string;
  departmentName?: string;
  isActive: boolean;
}

/** A row carrying only its generated id, from an `INSERT ... RETURNING id`. */
export interface IdRow {
  id: number;
}

/** One row of `EXPLAIN (ANALYZE, FORMAT JSON)`, holding the plan array. */
export interface ExplainRow {
  'QUERY PLAN': Array<{ 'Execution Time': number }>;
}

export const bodyOf = <T>(res: Response): T => res.body as T;

export const rowsOf = <T>(
  dataSource: DataSource,
  sql: string,
  params?: unknown[],
): Promise<T[]> => dataSource.query<T[]>(sql, params);
