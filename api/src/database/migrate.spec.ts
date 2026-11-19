import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from './migration-runner.js';
import type { MigrationClient } from './migration-runner.js';

describe('runMigrations', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'api-migrations-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('applies migrations in order and skips names already recorded', async () => {
    await writeFile(join(directory, '002_add_table.sql'), 'SELECT 2;');
    await writeFile(join(directory, '001_create_table.sql'), 'SELECT 1;');
    await writeFile(join(directory, 'ignore.txt'), 'not a migration');
    const recorded = new Set<string>();
    const executed: string[] = [];
    const client: MigrationClient = {
      query: vi.fn(async (query: string, values?: unknown[]) => {
        if (query.startsWith('SELECT 1 FROM schema_migrations')) {
          return {
            rowCount: recorded.has(String(values?.[0])) ? 1 : 0,
          };
        }
        if (query.startsWith('INSERT INTO schema_migrations')) {
          recorded.add(String(values?.[0]));
        }
        if (query.startsWith('SELECT 2;') || query.startsWith('SELECT 1;')) {
          executed.push(query);
        }
        return { rowCount: 1 };
      }),
    };

    await expect(runMigrations(client, directory)).resolves.toEqual([
      '001_create_table.sql',
      '002_add_table.sql',
    ]);
    expect(executed).toEqual(['SELECT 1;', 'SELECT 2;']);
    expect(client.query.mock.calls).toContainEqual([
      'SELECT pg_advisory_unlock($1)',
      [741_902_561],
    ]);
    expect(await readdir(directory)).toHaveLength(3);
    expect(await readFile(join(directory, '001_create_table.sql'), 'utf8'))
      .toBe('SELECT 1;');
  });

  it('rolls back a failed migration and releases the migration lock', async () => {
    await writeFile(join(directory, '001_fail.sql'), 'BROKEN SQL');
    const statements: string[] = [];
    const client: MigrationClient = {
      query: vi.fn(async (query: string) => {
        statements.push(query);
        if (query === 'BROKEN SQL') throw new Error('migration failed');
        return { rowCount: 0 };
      }),
    };

    await expect(runMigrations(client, directory)).rejects.toThrow(
      'migration failed',
    );
    expect(statements).toContain('ROLLBACK');
    expect(statements.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
  });
});
