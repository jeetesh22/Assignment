import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { DocumentStorageService } from '../documents/document-storage.service.js';
import { DocumentTextExtractor } from '../documents/document-text-extractor.service.js';
import {
  DocumentFileType,
  DocumentRecord,
  DocumentStatus,
} from '../documents/schemas/document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from '../documents/summary.types.js';
import { GENERATE_SUMMARY_JOB, PROCESS_DOCUMENT_JOB } from './ai.constants.js';
import { AiProcessor } from './ai.processor.js';
import { AiService } from './ai.service.js';

describe('AiProcessor', () => {
  let processor: AiProcessor;
  const documentId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const document = {
    _id: documentId,
    owner: ownerId,
    title: 'Test document',
    originalName: 'test.txt',
    fileType: DocumentFileType.TXT,
    fileSize: 64,
    contentHash: 'a'.repeat(64),
    storageKey: 'f07512c9-54ac-4c6f-9f4b-99d5a5a56891.txt',
    summary: '',
    summaries: new Map(),
    summaryGenerationStatus: SummaryGenerationStatus.IDLE,
    summaryGenerationType: SummaryType.SHORT,
    summaryGenerationError: '',
    processingError: '',
    status: DocumentStatus.UPLOADED,
    extractedText: '',
    save: vi.fn(),
  };
  const query = {
    select: vi.fn(),
    exec: vi.fn(),
  };
  const documentModel = {
    findById: vi.fn(),
  };
  const aiService = {
    generateSummary: vi.fn(),
    generateDocumentEmbeddings: vi.fn(),
    syncDocumentMetadata: vi.fn(),
    updateDocumentStatus: vi.fn(),
    saveSummary: vi.fn(),
  };
  const storage = {
    read: vi.fn(),
  };
  const textExtractor = {
    extract: vi.fn(),
  };
  const stageHistory: DocumentStatus[] = [];
  const processingOrder: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    stageHistory.length = 0;
    processingOrder.length = 0;
    document.status = DocumentStatus.UPLOADED;
    document.summary = '';
    document.extractedText = '';
    document.summaries = new Map();
    document.summaryGenerationStatus = SummaryGenerationStatus.IDLE;
    document.summaryGenerationType = SummaryType.SHORT;
    document.summaryGenerationError = '';
    document.processingError = '';
    document.save.mockImplementation(async () => {
      stageHistory.push(document.status);
      return document;
    });
    query.select.mockReturnValue(query);
    query.exec.mockResolvedValue(document);
    documentModel.findById.mockReturnValue(query);
    storage.read.mockResolvedValue(Buffer.from('raw file'));
    textExtractor.extract.mockResolvedValue('Extracted document text');
    aiService.generateSummary.mockImplementation(async () => {
      processingOrder.push('summary');
      return 'Summary';
    });
    aiService.generateDocumentEmbeddings.mockImplementation(async () => {
      processingOrder.push('embeddings');
      return 1;
    });
    aiService.updateDocumentStatus.mockResolvedValue(undefined);
    aiService.saveSummary.mockResolvedValue(undefined);
    aiService.syncDocumentMetadata.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProcessor,
        { provide: getModelToken(DocumentRecord.name), useValue: documentModel },
        { provide: AiService, useValue: aiService },
        { provide: DocumentStorageService, useValue: storage },
        { provide: DocumentTextExtractor, useValue: textExtractor },
      ],
    }).compile();

    processor = module.get(AiProcessor);
  });

  it('extracts, embeds, summarizes, and records each asynchronous stage', async () => {
    await processor.process(createJob(0));

    expect(documentModel.findById).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(query.select).toHaveBeenCalledWith('+storageKey +contentHash');
    expect(storage.read).toHaveBeenCalledWith(document.storageKey);
    expect(textExtractor.extract).toHaveBeenCalledWith(
      DocumentFileType.TXT,
      Buffer.from('raw file'),
    );
    expect(aiService.generateDocumentEmbeddings).toHaveBeenCalledWith(
      documentId.toString(),
      ownerId.toString(),
      'Extracted document text',
      {
        title: 'Test document',
        originalName: 'test.txt',
        fileType: DocumentFileType.TXT,
        fileSize: 64,
        contentHash: 'a'.repeat(64),
        status: DocumentStatus.GENERATING_EMBEDDINGS,
      },
    );
    expect(aiService.generateSummary).toHaveBeenCalledWith(
      'Extracted document text',
      SummaryType.SHORT,
    );
    expect(processingOrder).toEqual(['embeddings', 'summary']);
    expect(stageHistory).toEqual(
      expect.arrayContaining([
        DocumentStatus.PROCESSING,
        DocumentStatus.EXTRACTING,
        DocumentStatus.GENERATING_EMBEDDINGS,
        DocumentStatus.SUMMARIZING,
        DocumentStatus.COMPLETED,
      ]),
    );
    expect(document.summary).toBe('Summary');
    expect(document.summaries.get(SummaryType.SHORT)).toBe('Summary');
    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.COMPLETED,
    );
    expect(document.status).toBe(DocumentStatus.COMPLETED);
  });

  it('generates and persists requested summary formats asynchronously', async () => {
    document.status = DocumentStatus.COMPLETED;
    document.extractedText = 'Extracted document text';

    await processor.process(createSummaryJob(0, SummaryType.EXECUTIVE));

    expect(aiService.generateSummary).toHaveBeenCalledWith(
      'Extracted document text',
      SummaryType.EXECUTIVE,
    );
    expect(document.summaries.get(SummaryType.EXECUTIVE)).toBe('Summary');
    expect(document.summaryGenerationType).toBe(SummaryType.EXECUTIVE);
    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.COMPLETED,
    );
    expect(document.status).toBe(DocumentStatus.COMPLETED);
  });

  it('records summary failures without failing an already processed document', async () => {
    document.status = DocumentStatus.COMPLETED;
    document.extractedText = 'Extracted document text';
    aiService.generateSummary.mockRejectedValue(
      new Error('Summary generation is temporarily unavailable'),
    );

    await expect(
      processor.process(createSummaryJob(2, SummaryType.KEY_INSIGHTS)),
    ).rejects.toThrow('Summary generation is temporarily unavailable');

    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.FAILED,
    );
    expect(document.summaryGenerationError).toBe(
      'Summary generation failed unexpectedly',
    );
    expect(document.status).toBe(DocumentStatus.COMPLETED);
  });

  it('retries transient AI failures and exposes a safe final failure status', async () => {
    aiService.generateSummary.mockRejectedValue(new Error('OpenAI timeout'));

    await expect(processor.process(createJob(0))).rejects.toThrow(
      'OpenAI timeout',
    );
    expect(document.status).toBe(DocumentStatus.SUMMARIZING);

    await expect(processor.process(createJob(2))).rejects.toThrow(
      'OpenAI timeout',
    );
    expect(document.status).toBe(DocumentStatus.FAILED);
    expect(document.processingError).toBe(
      'Document processing failed unexpectedly',
    );
    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.FAILED,
    );
  });
});

function createJob(attemptsMade: number): Job {
  return {
    name: PROCESS_DOCUMENT_JOB,
    data: { documentId: new Types.ObjectId().toString() },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job;
}

function createSummaryJob(
  attemptsMade: number,
  summaryType: SummaryType,
): Job {
  return {
    name: GENERATE_SUMMARY_JOB,
    data: {
      documentId: new Types.ObjectId().toString(),
      summaryType,
    },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job;
}
