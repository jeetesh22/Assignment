import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIGRATION_LOCK_ID = 741_902_561;
const MIGRATION_FILE_PATTERN = /^\d+_[a-z0-9_-]+\.sql$/i;

export interface MigrationClient {
  query(
    queryText: string,
    values?: unknown[],
  ): Promise<{ rowCount: number | null }>;
}

export async function runMigrations(
  client: MigrationClient,
  migrationsDirectory: string,
): Promise<string[]> {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('GRANT SELECT ON schema_migrations TO PUBLIC');

    const files = (await readdir(migrationsDirectory))
      .filter((name) => MIGRATION_FILE_PATTERN.test(name))
      .sort();
    const applied: string[] = [];

    for (const name of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (existing.rowCount) continue;

      const sql = await readFile(resolve(migrationsDirectory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [name],
        );
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Migration ${name} failed and its transaction could not be rolled back`,
          );
        }
        throw error;
      }
    }

    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  }
}
