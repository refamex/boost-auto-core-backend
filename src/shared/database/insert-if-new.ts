import { ObjectLiteral, Repository } from 'typeorm';

/**
 * Inserta una fila descartando el choque contra un índice único
 * (`INSERT ... ON CONFLICT DO NOTHING`). Devuelve `true` si la fila entró y
 * `false` si ya existía.
 *
 * Es el reemplazo del patrón insertar-y-atrapar-23505: aguanta la misma
 * carrera entre réplicas, pero la base nunca levanta el error, así que un
 * duplicado esperado deja de pintarse como `error` en los logs.
 *
 * Postgres devuelve cero filas cuando descarta el insert, de ahí que el
 * `RETURNING` de la clave primaria alcance para distinguir los dos casos.
 */
export async function insertIfNew<T extends ObjectLiteral>(
  repo: Repository<T>,
  values: Partial<T>,
): Promise<boolean> {
  const primaryColumn = repo.metadata.primaryColumns[0]?.databaseName ?? 'id';

  const result = await repo
    .createQueryBuilder()
    .insert()
    .into(repo.target)
    // `Partial<T>` rather than TypeORM's deep-partial input type: the latter
    // rejects a plain `Record<string, unknown>` jsonb column, and checking the
    // call sites against the entity's own fields is the check worth having.
    .values(values)
    .orIgnore()
    .returning([primaryColumn])
    .updateEntity(false)
    .execute();

  return Array.isArray(result.raw) && result.raw.length > 0;
}
