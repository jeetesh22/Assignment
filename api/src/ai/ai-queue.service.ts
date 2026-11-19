import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  AI_QUEUE,
  GENERATE_SUMMARY_JOB,
  PROCESS_DOCUMENT_JOB,
} from './ai.constants.js';
import { SummaryType } from '../documents/summary.types.js';
import { AiProcessor } from './ai.processor.js';

export interface ProcessDocumentJob {
  documentId: string;
}

export interface GenerateDocumentSummaryJob {
  documentId: string;
  summaryType: SummaryType;
}

interface LocalAiJob {
  name: string;
  data: ProcessDocumentJob | GenerateDocumentSummaryJob;
}

function isRedisUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : '';
  if (
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code)
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|connection is closed/i.test(
    message,
  );
}

@Injectable()
export class AiQueueService {
  private readonly logger = new Logger(AiQueueService.name);
  private readonly localJobs: LocalAiJob[] = [];
  private localQueueRunning = false;

  constructor(
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
    private readonly processor: AiProcessor,
  ) {}

  async enqueueDocument(documentId: string): Promise<void> {
    await this.enqueue(
      PROCESS_DOCUMENT_JOB,
      { documentId } satisfies ProcessDocumentJob,
      `document-${documentId}`,
    );
  }

  async enqueueSummary(
    documentId: string,
    summaryType: SummaryType,
  ): Promise<void> {
    await this.enqueue(
      GENERATE_SUMMARY_JOB,
      { documentId, summaryType } satisfies GenerateDocumentSummaryJob,
      `summary-${documentId}-${summaryType}-${randomUUID()}`,
    );
  }

  private async enqueue(
    name: string,
    data: LocalAiJob['data'],
    jobId: string,
  ): Promise<void> {
    try {
      await this.queue.add(name, data, { jobId });
    } catch (error) {
      if (
        this.config.get<string>('NODE_ENV') !== 'development' ||
        !isRedisUnavailable(error)
      ) {
        throw error;
      }

      this.logger.warn(
        'Redis is unavailable; processing this AI job in-process for development. Pending jobs are lost if the API restarts.',
      );
      this.localJobs.push({ name, data });
      this.startLocalQueue();
    }
  }

  private startLocalQueue(): void {
    if (this.localQueueRunning) return;
    this.localQueueRunning = true;
    setImmediate(() => void this.drainLocalQueue());
  }

  private async drainLocalQueue(): Promise<void> {
    while (this.localJobs.length > 0) {
      const job = this.localJobs.shift();
      if (!job) continue;

      try {
        await this.processor.processLocally(job.name, job.data);
      } catch (error) {
        this.logger.error(
          'In-process document AI job failed',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.localQueueRunning = false;
    if (this.localJobs.length > 0) this.startLocalQueue();
  }
}
