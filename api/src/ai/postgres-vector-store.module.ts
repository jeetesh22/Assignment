import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  POSTGRES_POOL,
  PostgresVectorStore,
} from './postgres-vector-store.service.js';

@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('POSTGRES_URL')?.trim();
        return connectionString
          ? new Pool({
              connectionString,
              connectionTimeoutMillis: 5_000,
              idleTimeoutMillis: 30_000,
              max: 10,
            })
          : null;
      },
    },
    PostgresVectorStore,
  ],
  exports: [PostgresVectorStore],
})
export class PostgresVectorStoreModule {}
