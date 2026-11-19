import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Types } from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';
import { DocumentRecord, DocumentStatus } from '../documents/schemas/document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from '../documents/summary.types.js';
import {
  AI_QUEUE,
  GENERATE_SUMMARY_JOB,
  PROCESS_DOCUMENT_JOB,
} from './ai.constants.js';
import { AiService } from './ai.service.js';
import type {
  GenerateDocumentSummaryJob,
  ProcessDocumentJob,
} from './ai-queue.service.js';
import { DocumentStorageService } from '../documents/document-storage.service.js';
import { DocumentTextExtractor } from '../documents/document-text-extractor.service.js';

function isProcessDocumentJob(value: unknown): value is ProcessDocumentJob {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documentId' in value &&
    typeof value.documentId === 'string'
  );
}

function isGenerateSummaryJob(
  value: unknown,
): value is GenerateDocumentSummaryJob {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documentId' in value &&
    typeof value.documentId === 'string' &&
    'summaryType' in value &&
    Object.values(SummaryType).some((type) => type === value.summaryType)
  );
}

@Processor(AI_QUEUE, { concurrency: 2 })
@Injectable()
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  private readonly localProcessingAttempts = 3;

  constructor(
    @InjectModel(DocumentRecord.name)
    private readonly documentModel: Model<DocumentRecord>,
    private readonly aiService: AiService,
    private readonly storage: DocumentStorageService,
    private readonly textExtractor: DocumentTextExtractor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.processJob(
      job.name,
      job.data,
      job.attemptsMade + 1,
      job.opts.attempts ?? 1,
    );
  }

  async processLocally(name: string, data: unknown): Promise<void> {
    await this.retryLocally((attemptNumber, maxAttempts) =>
      this.processJob(name, data, attemptNumber, maxAttempts),
    );
  }

  private async processJob(
    name: string,
    data: unknown,
    attemptNumber: number,
    maxAttempts: number,
  ): Promise<void> {
    if (name === PROCESS_DOCUMENT_JOB) {
      if (
        !isProcessDocumentJob(data) ||
        !Types.ObjectId.isValid(data.documentId)
      ) {
        throw new UnrecoverableError('Invalid document processing job');
      }

      await this.processDocument(
        data.documentId,
        attemptNumber,
        maxAttempts,
      );
      return;
    }

    if (name === GENERATE_SUMMARY_JOB) {
      if (
        !isGenerateSummaryJob(data) ||
        !Types.ObjectId.isValid(data.documentId)
      ) {
        throw new UnrecoverableError('Invalid summary generation job');
      }

      await this.processSummary(
        data.documentId,
        data.summaryType,
        attemptNumber,
        maxAttempts,
      );
      return;
    }

    throw new UnrecoverableError('Unknown document AI job');
  }

  private async retryLocally(
    operation: (attemptNumber: number, maxAttempts: number) => Promise<void>,
  ): Promise<void> {
    for (
      let attemptNumber = 1;
      attemptNumber <= this.localProcessingAttempts;
      attemptNumber += 1
    ) {
      try {
        await operation(attemptNumber, this.localProcessingAttempts);
        return;
      } catch (error) {
        if (
          error instanceof UnrecoverableError ||
          attemptNumber === this.localProcessingAttempts
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 2 ** (attemptNumber - 1)),
        );
      }
    }
  }

  private async processDocument(
    documentId: string,
    attemptNumber: number,
    maxAttempts: number,
  ): Promise<void> {
    const document = await this.documentModel
      .findById(documentId)
      .select('+storageKey +contentHash')
      .exec();
    if (!document) {
      throw new UnrecoverableError('Document for processing job was not found');
    }
    if (document.status === DocumentStatus.COMPLETED) {
      return;
    }

    try {
      await this.aiService.syncDocumentMetadata(
        document._id.toString(),
        document.owner.toString(),
        {
          title: document.title,
          originalName: document.originalName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          contentHash: document.contentHash,
          status: document.status,
        },
      );
      await this.setStage(document, DocumentStatus.PROCESSING);
      await this.setStage(document, DocumentStatus.EXTRACTING);
      const originalFile = await this.storage.read(document.storageKey);
      document.extractedText = await this.textExtractor.extract(
        document.fileType,
        originalFile,
      );
      await document.save();

      await this.setStage(document, DocumentStatus.GENERATING_EMBEDDINGS);
      await this.aiService.generateDocumentEmbeddings(
        document._id.toString(),
        document.owner.toString(),
        document.extractedText,
        {
          title: document.title,
          originalName: document.originalName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          contentHash: document.contentHash,
          status: DocumentStatus.GENERATING_EMBEDDINGS,
        },
      );

      await this.setStage(document, DocumentStatus.SUMMARIZING);
      document.summary = await this.aiService.generateSummary(
        document.extractedText,
        SummaryType.SHORT,
      );
      if (!document.summaries) document.summaries = new Map();
      document.summaries.set(SummaryType.SHORT, document.summary);
      document.summaryGenerationType = SummaryType.SHORT;
      document.summaryGenerationStatus = SummaryGenerationStatus.COMPLETED;
      document.summaryGenerationError = '';

      document.status = DocumentStatus.COMPLETED;
      document.processingError = '';
      await document.save();
      await this.aiService.updateDocumentStatus(
        document._id.toString(),
        document.owner.toString(),
        document.status,
      );
      await this.aiService.saveSummary(
        document._id.toString(),
        document.owner.toString(),
        SummaryType.SHORT,
        SummaryGenerationStatus.COMPLETED,
        document.summary,
      );
    } catch (error) {
      const failedDuringSummary = document.status === DocumentStatus.SUMMARIZING;
      if (attemptNumber >= maxAttempts) {
        document.status = DocumentStatus.FAILED;
        document.processingError = this.getSafeFailureMessage(error);
        if (failedDuringSummary) {
          document.summaryGenerationType = SummaryType.SHORT;
          document.summaryGenerationStatus = SummaryGenerationStatus.FAILED;
          document.summaryGenerationError =
            this.getSafeFailureMessage(error);
        }
        await document.save();
        await this.aiService.updateDocumentStatus(
          document._id.toString(),
          document.owner.toString(),
          DocumentStatus.FAILED,
        );
        if (failedDuringSummary) {
          await this.aiService.saveSummary(
            document._id.toString(),
            document.owner.toString(),
            SummaryType.SHORT,
            SummaryGenerationStatus.FAILED,
            '',
            this.getSafeFailureMessage(error),
          );
        }
      }
      this.logger.warn(`Document AI processing failed on attempt ${attemptNumber}`);
      throw error;
    }
  }

  private async processSummary(
    documentId: string,
    summaryType: SummaryType,
    attemptNumber: number,
    maxAttempts: number,
  ): Promise<void> {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new UnrecoverableError('Document for summary job was not found');
    }
    if (!document.extractedText.trim()) {
      document.summaryGenerationType = summaryType;
      document.summaryGenerationStatus = SummaryGenerationStatus.FAILED;
      document.summaryGenerationError =
        'Extracted document text is not available for summarization.';
      await document.save();
      throw new UnrecoverableError(
        'Extracted document text is not available for summarization',
      );
    }

    try {
      await this.aiService.syncDocumentMetadata(
        document._id.toString(),
        document.owner.toString(),
        {
          title: document.title,
          originalName: document.originalName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          contentHash: document.contentHash,
          status: document.status,
        },
      );
      document.summaryGenerationType = summaryType;
      document.summaryGenerationStatus = SummaryGenerationStatus.GENERATING;
      document.summaryGenerationError = '';
      await document.save();
      await this.aiService.saveSummary(
        document._id.toString(),
        document.owner.toString(),
        summaryType,
        SummaryGenerationStatus.GENERATING,
      );

      const summary = await this.aiService.generateSummary(
        document.extractedText,
        summaryType,
      );
      if (!document.summaries) document.summaries = new Map();
      document.summaries.set(summaryType, summary);
      if (summaryType === SummaryType.SHORT) {
        document.summary = summary;
      }
      document.summaryGenerationStatus = SummaryGenerationStatus.COMPLETED;
      document.summaryGenerationError = '';
      await document.save();
      await this.aiService.saveSummary(
        document._id.toString(),
        document.owner.toString(),
        summaryType,
        SummaryGenerationStatus.COMPLETED,
        summary,
      );
    } catch (error) {
      if (attemptNumber >= maxAttempts) {
        document.summaryGenerationType = summaryType;
        document.summaryGenerationStatus = SummaryGenerationStatus.FAILED;
        document.summaryGenerationError = this.getSafeFailureMessage(
          error,
          'Summary generation failed unexpectedly',
        );
        await document.save();
        await this.aiService.saveSummary(
          document._id.toString(),
          document.owner.toString(),
          summaryType,
          SummaryGenerationStatus.FAILED,
          '',
          document.summaryGenerationError,
        );
      }
      this.logger.warn(
        `Summary generation failed on attempt ${attemptNumber}`,
      );
      throw error;
    }
  }

  private async setStage(
    document: HydratedDocument<DocumentRecord>,
    status: DocumentStatus,
  ): Promise<void> {
    document.status = status;
    document.processingError = '';
    if (status === DocumentStatus.SUMMARIZING) {
      document.summaryGenerationType = SummaryType.SHORT;
      document.summaryGenerationStatus = SummaryGenerationStatus.GENERATING;
      document.summaryGenerationError = '';
    }
    await document.save();
    await this.aiService.updateDocumentStatus(
      document._id.toString(),
      document.owner.toString(),
      status,
    );
  }

  private getSafeFailureMessage(
    error: unknown,
    fallback = 'Document processing failed unexpectedly',
  ): string {
    if (
      error instanceof BadRequestException ||
      error instanceof UnprocessableEntityException ||
      error instanceof ServiceUnavailableException
    ) {
      return error.message.slice(0, 500);
    }
    return fallback;
  }
}
