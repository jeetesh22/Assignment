import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import OpenAI from 'openai';
import {
  DocumentRecord,
  DocumentSchema,
} from '../documents/schemas/document.schema.js';
import { DocumentFilesModule } from '../documents/document-files.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AI_QUEUE,
  OPENAI_MAX_RETRIES,
  OPENAI_TIMEOUT_MS,
} from './ai.constants.js';
import { AiProcessor } from './ai.processor.js';
import { AiQueueService } from './ai-queue.service.js';
import { AiService } from './ai.service.js';
import { SemanticSearchService } from './semantic-search.service.js';
import { PostgresVectorStoreModule } from './postgres-vector-store.module.js';

@Module({
  imports: [
    DocumentFilesModule,
    PostgresVectorStoreModule,
    UsersModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
          retryStrategy: (attempt: number) =>
            attempt > 5 ? null : Math.min(attempt * 250, 1000),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      }),
    }),
    BullModule.registerQueue({ name: AI_QUEUE }),
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentSchema },
    ]),
  ],
  providers: [
    {
      provide: OpenAI,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('OPENAI_API_KEY')?.trim();
        return apiKey
          ? new OpenAI({
              apiKey,
              timeout: OPENAI_TIMEOUT_MS,
              maxRetries: OPENAI_MAX_RETRIES,
            })
          : null;
      },
    },
    AiService,
    AiQueueService,
    AiProcessor,
    SemanticSearchService,
  ],
  exports: [AiService, AiQueueService, SemanticSearchService],
})
export class AiModule {}
