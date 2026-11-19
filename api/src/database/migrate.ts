import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { resolve } from 'node:path';
import { runMigrations } from './migration-runner.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
class MigrationCliModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MigrationCliModule, {
    logger: ['error'],
  });
  const pool = new Pool({
    connectionString: app.get(ConfigService).getOrThrow<string>('POSTGRES_URL'),
    connectionTimeoutMillis: 5_000,
  });
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    const applied = await runMigrations(
      client,
      resolve(process.cwd(), 'database', 'migrations'),
    );
    if (applied.length === 0) {
      console.log('Database schema is already up to date.');
    } else {
      console.log(`Applied database migrations: ${applied.join(', ')}`);
    }
  } finally {
    client?.release();
    await pool.end();
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
