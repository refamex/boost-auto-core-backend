import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Checks the initial schema migration against ITSELF.
 *
 * This is the guard that was missing. `fdcc5ee` rewrote every `CREATE TABLE`
 * in this file from code/sku columns to id columns and updated only SOME of
 * the `CREATE INDEX` statements — a partial find-and-replace. Twelve were left
 * pointing at columns the file no longer creates, so a fresh database dies
 * mid-migration and cannot boot the service at all.
 *
 * Nothing caught it because the repository has no CI workflows and every e2e
 * spec is wrapped in `hasDocker() ? describe : describe.skip`. With Docker
 * down, the fresh-migration path reports green in silence.
 *
 * So this asserts self-consistency rather than schema truth: every column an
 * index references must be declared by a `CREATE TABLE` in the same file. That
 * needs no database, runs in milliseconds under the default `pnpm test`, and
 * cannot be skipped. The Testcontainers spec remains the authority on what the
 * database actually ends up with; this one just makes the whole defect class
 * impossible to reintroduce.
 *
 * It lives in `__tests__/` rather than beside the migrations on purpose: every
 * e2e DataSource declares `migrations: ['src/shared/database/migrations/*.ts']`,
 * an unrestricted glob, so TypeORM would load a spec file there AS a migration
 * and execute its `describe` blocks after Jest had already started — breaking
 * all four existing e2e suites, not just this file's own.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations');
const MIGRATION = join(MIGRATIONS, '1700000000000-InitialSchema.ts');
const REPAIR = join(MIGRATIONS, '1787788800000-RestoreIdBasedIndexes.ts');

interface IndexRef {
  name: string;
  qualifiedTable: string;
  /** Key columns and INCLUDE columns stay SEPARATE: an index that promotes a
   *  covering column into the key is a different index, and flattening the two
   *  into one list makes that divergence compare equal. */
  keyColumns: string[];
  includeColumns: string[];
  /** Both, for the dangling-column checks, which only care that each referenced
   *  column exists somewhere on the table. */
  columns: string[];
}

/** `CREATE TABLE <schema>.<table> ( ... )` -> the column names it declares. */
function declaredColumns(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const createTable =
    /CREATE TABLE\s+([\w.]+)\s*\(([\s\S]*?)\n\s*\)\s*\n?\s*`/gi;

  for (const match of sql.matchAll(createTable)) {
    const [, qualifiedTable, body] = match;
    const columns = new Set<string>();

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      // Skip table-level constraints; they declare no column of their own.
      if (
        /^(UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|CHECK|CONSTRAINT)\b/i.test(line)
      )
        continue;
      const column = /^([a-z_][a-z0-9_]*)\s+/i.exec(line);
      if (column) columns.add(column[1].toLowerCase());
    }

    tables.set(qualifiedTable.toLowerCase(), columns);
  }

  return tables;
}

/** `CREATE INDEX <name> ON <schema>.<table>(a, b) [INCLUDE (c)]` */
function indexReferences(sql: string): IndexRef[] {
  const refs: IndexRef[] = [];
  const createIndex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?([\w]+)\s+ON\s+([\w.]+)\s*\(([^)]*)\)(?:\s*INCLUDE\s*\(([^)]*)\))?/gi;

  for (const match of sql.matchAll(createIndex)) {
    const [, name, qualifiedTable, keyCols, includeCols] = match;
    const split = (cols: string | undefined): string[] =>
      (cols ?? '')
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
        // Expression indexes are out of scope for this check.
        .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));

    const keyColumns = split(keyCols);
    const includeColumns = split(includeCols);

    refs.push({
      name,
      qualifiedTable: qualifiedTable.toLowerCase(),
      keyColumns,
      includeColumns,
      columns: [...keyColumns, ...includeColumns],
    });
  }

  return refs;
}

describe('InitialSchema is internally consistent', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const tables = declaredColumns(sql);
  const indexes = indexReferences(sql);

  // Guards against a regex that silently matches nothing, which would make
  // every assertion below pass by vacuity — the exact failure this file exists
  // to prevent, one level up.
  it('parses the migration at all', () => {
    // EXACT, not a floor. A loose floor lets a regex silently stop matching a
    // third of the file while the dangling-column checks below skip precisely
    // what went unparsed. Bump these deliberately when adding a table or index.
    expect(tables.size).toBe(34);
    expect(indexes.length).toBe(38);
  });

  it('every indexed table is declared in the same file', () => {
    const missing = indexes
      .filter((i) => !tables.has(i.qualifiedTable))
      .map((i) => `${i.name} -> ${i.qualifiedTable}`);

    expect(missing).toEqual([]);
  });

  it('every indexed column is declared by its own CREATE TABLE', () => {
    const dangling: string[] = [];

    for (const index of indexes) {
      const columns = tables.get(index.qualifiedTable);
      if (!columns) continue; // reported by the test above

      for (const column of index.columns) {
        if (!columns.has(column)) {
          dangling.push(`${index.name}: ${index.qualifiedTable}.${column}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });
});

// The repair migration creates indexes against the SAME tables, so it can
// reintroduce the identical defect — and it did during authoring: a plural
// table name and a two-column index copied as one. Checking it by hand is not
// a defence.
describe('RestoreIdBasedIndexes matches the declared schema', () => {
  const schema = readFileSync(MIGRATION, 'utf8');
  const repair = readFileSync(REPAIR, 'utf8');
  const tables = declaredColumns(schema);
  const indexes = indexReferences(repair);

  it('parses the repair migration at all', () => {
    expect(indexes.length).toBe(12);
  });

  it('every column it indexes is declared by the initial schema', () => {
    const dangling: string[] = [];

    for (const index of indexes) {
      const columns = tables.get(index.qualifiedTable);
      if (!columns) {
        dangling.push(`${index.name}: unknown table ${index.qualifiedTable}`);
        continue;
      }
      for (const column of index.columns) {
        if (!columns.has(column)) {
          dangling.push(`${index.name}: ${index.qualifiedTable}.${column}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  // Convergence is what matters: every index the repair creates must be
  // defined IDENTICALLY in the initial schema, so a fresh database (which gets
  // it from there) and production (which gets it from here) end up the same.
  //
  // Not the other direction. Some indexes on these tables sit on columns that
  // were never renamed — they survived in production and must not be recreated.
  it('defines each index exactly as the initial schema does', () => {
    const norm = (i: IndexRef) =>
      `${i.qualifiedTable}.${i.name}(${i.keyColumns.join(',')})` +
      (i.includeColumns.length
        ? ` INCLUDE(${i.includeColumns.join(',')})`
        : '');
    const bySchema = new Map(
      indexReferences(schema).map((i) => [i.name, norm(i)]),
    );

    const mismatched = indexes
      .filter((i) => bySchema.get(i.name) !== norm(i))
      .map((i) => `${norm(i)} vs schema ${bySchema.get(i.name) ?? 'ABSENT'}`);

    expect(mismatched).toEqual([]);
  });

  // The repair must cover every index whose LEADING column was renamed by the
  // id migration, because CASCADE took exactly those out of production.
  it('covers every index the id migration destroyed', () => {
    const destroyed = [
      'idx_compat_vehicle_lookup',
      'idx_compat_year_id',
      'idx_compat_plant_id',
      'idx_compat_motorization_id',
      'idx_mcm_motorization_model',
      'idx_model_car_plant_id',
      'idx_pxref_product_id',
      'idx_pxref_reference_id',
      'idx_products_image_product',
      'idx_inventory_product_id',
      'idx_inventory_product_branch',
      'idx_inventory_stock',
    ];

    expect(indexes.map((i) => i.name).sort()).toEqual([...destroyed].sort());
  });
});
