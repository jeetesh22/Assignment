import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { AI_QUEUE, PROCESS_DOCUMENT_JOB } from './ai.constants.js';
import { SummaryType } from '../documents/summary.types.js';
import { GENERATE_SUMMARY_JOB } from './ai.constants.js';
import { AiQueueService } from './ai-queue.service.js';
import { AiProcessor } from './ai.processor.js';

describe('AiQueueService', () => {
  let service: AiQueueService;
  const queue = { add: vi.fn() };
  const config = { get: vi.fn() };
  const processor = { processLocally: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    queue.add.mockResolvedValue(undefined);
    config.get.mockReturnValue('development');
    processor.processLocally.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiQueueService,
        { provide: getQueueToken(AI_QUEUE), useValue: queue },
        { provide: ConfigService, useValue: config },
        { provide: AiProcessor, useValue: processor },
      ],
    }).compile();
    service = module.get(AiQueueService);
  });

  it('queues document processing when Redis is connected', async () => {
    await expect(service.enqueueDocument('document-id')).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledWith(
      PROCESS_DOCUMENT_JOB,
      { documentId: 'document-id' },
      { jobId: 'document-document-id' },
    );
  });

  it('propagates queue errors so the upload can report the failure', async () => {
    queue.add.mockRejectedValueOnce(new Error('queue offline'));
    await expect(service.enqueueDocument('document-id')).rejects.toThrow(
      'queue offline',
    );
  });

  it('uses the in-process queue for Redis connection failures in development', async () => {
    queue.add.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:6379'),
    );

    await service.enqueueDocument('document-id');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(processor.processLocally).toHaveBeenCalledWith(
      PROCESS_DOCUMENT_JOB,
      { documentId: 'document-id' },
    );
  });

  it('does not use the in-process queue in production', async () => {
    config.get.mockReturnValue('production');
    queue.add.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:6379'),
    );

    await expect(service.enqueueDocument('document-id')).rejects.toThrow(
      'ECONNREFUSED',
    );
    expect(processor.processLocally).not.toHaveBeenCalled();
  });

  it('queues an on-demand summary job with a retry-safe unique ID', async () => {
    await service.enqueueSummary('document-id', SummaryType.DETAILED);

    expect(queue.add).toHaveBeenCalledWith(
      GENERATE_SUMMARY_JOB,
      { documentId: 'document-id', summaryType: SummaryType.DETAILED },
      {
        jobId: expect.stringMatching(/^summary-document-id-DETAILED-/),
      },
    );
  });
});
