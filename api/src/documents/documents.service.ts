import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { basename, extname, parse } from 'node:path';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { AiQueueService } from '../ai/ai-queue.service.js';
import { AiService } from '../ai/ai.service.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import {
  DocumentFileType,
  DocumentRecord,
  DocumentStatus,
} from './schemas/document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from './summary.types.js';
import { DocumentStorageService } from './document-storage.service.js';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js';
import type {
  DocumentDashboardStats,
  PaginatedDocuments,
  PublicDocument,
} from './document.types.js';

export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
const MAX_ORIGINAL_NAME_LENGTH = 255;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

interface UploadedDocumentMetadata {
  originalName: string;
  title: string;
  fileType: DocumentFileType;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(DocumentRecord.name)
    private readonly documentModel: Model<DocumentRecord>,
    private readonly storage: DocumentStorageService,
    private readonly aiQueue: AiQueueService,
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}

  async upload(
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ): Promise<PublicDocument> {
    const metadata = this.validateUpload(file);
    const owner = new Types.ObjectId(user.id);
    const contentHash = createHash('sha256')
      .update(file.buffer)
      .digest('hex');
    const existing = await this.documentModel
      .findOne({ owner, contentHash })
      .select('_id')
      .exec();
    if (existing) {
      throw new ConflictException(
        'A document with identical content has already been uploaded',
      );
    }

    const storageKey = await this.storage.store(file.buffer, metadata.fileType);

    let document: HydratedDocument<DocumentRecord>;
    try {
      document = await this.documentModel.create({
        ...metadata,
        fileSize: file.size,
        extractedText: '',
        summary: '',
        owner,
        contentHash,
        status: DocumentStatus.UPLOADED,
        processingError: '',
        storageKey,
      });
    } catch (error) {
      await this.removeFileAfterFailedCreate(storageKey);
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A document with identical content has already been uploaded',
        );
      }
      throw error;
    }

    try {
      await this.aiService.syncDocumentMetadata(
        document._id.toString(),
        user.id,
        {
          title: document.title,
          originalName: document.originalName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          contentHash,
          status: DocumentStatus.UPLOADED,
        },
      );
    } catch (error) {
      try {
        await document.deleteOne();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'PostgreSQL document sync and MongoDB document cleanup both failed',
        );
      }
      await this.removeFileAfterFailedCreate(storageKey);
      throw error;
    }

    try {
      await this.aiQueue.enqueueDocument(document._id.toString());
    } catch (error) {
      document.status = DocumentStatus.FAILED;
      document.processingError =
        'The document could not be queued for processing.';
      await document.save();
      await this.aiService.updateDocumentStatus(
        document._id.toString(),
        user.id,
        DocumentStatus.FAILED,
      );
      this.logger.error(
        'Could not queue document processing',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Document was uploaded but processing could not be queued',
      );
    }
    return this.toPublicDocument(document);
  }

  async list(
    user: AuthenticatedUser,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocuments> {
    const filter = this.accessibleFilter(user);
    const skip = (query.page - 1) * query.limit;
    const [documents, total] = await Promise.all([
      this.documentModel
        .find(filter)
        .select('-extractedText -summaries')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.documentModel.countDocuments(filter).exec(),
    ]);

    const result = {
      items: documents.map((document) => this.toPublicDocument(document)),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
    return result;
  }

  async getDashboardStats(
    user: AuthenticatedUser,
  ): Promise<DocumentDashboardStats> {
    const filter = this.accessibleFilter(user);
    const [
      totalDocuments,
      summariesReady,
      completedDocuments,
      searches,
    ] = await Promise.all([
      this.documentModel.countDocuments(filter).exec(),
      this.documentModel
        .countDocuments({
          ...filter,
          summaryGenerationStatus: SummaryGenerationStatus.COMPLETED,
        })
        .exec(),
      this.documentModel
        .countDocuments({ ...filter, status: DocumentStatus.COMPLETED })
        .exec(),
      this.usersService.getSearchCount(user.id),
    ]);

    return {
      totalDocuments,
      summariesReady,
      completedDocuments,
      searches,
    };
  }

  async getById(id: string, user: AuthenticatedUser): Promise<PublicDocument> {
    const document = await this.findAccessibleDocument(id, user);
    return this.toPublicDocument(document, true, true);
  }

  async requestSummary(
    id: string,
    user: AuthenticatedUser,
    type: SummaryType,
  ): Promise<PublicDocument> {
    const document = await this.findAccessibleDocument(id, user);
    if (
      document.status !== DocumentStatus.COMPLETED &&
      document.status !== DocumentStatus.FAILED
    ) {
      throw new ConflictException(
        'Wait for document processing to finish before generating a summary',
      );
    }
    if (!document.extractedText.trim()) {
      throw new ConflictException(
        'Extracted document text is not available for summarization',
      );
    }
    if (
      document.summaryGenerationStatus === SummaryGenerationStatus.QUEUED ||
      document.summaryGenerationStatus === SummaryGenerationStatus.GENERATING
    ) {
      throw new ConflictException('A summary is already being generated');
    }

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
    document.summaryGenerationType = type;
    document.summaryGenerationStatus = SummaryGenerationStatus.QUEUED;
    document.summaryGenerationError = '';
    await document.save();
    try {
      await this.aiService.saveSummary(
        document._id.toString(),
        user.id,
        type,
        SummaryGenerationStatus.QUEUED,
        '',
        '',
        undefined,
        user.role === UserRole.ADMIN,
      );
    } catch (error) {
      document.summaryGenerationStatus = SummaryGenerationStatus.FAILED;
      document.summaryGenerationError =
        'Summary generation could not be stored. Please try again.';
      await document.save();
      throw error;
    }

    try {
      await this.aiQueue.enqueueSummary(document._id.toString(), type);
    } catch (error) {
      document.summaryGenerationStatus = SummaryGenerationStatus.FAILED;
      document.summaryGenerationError =
        'Summary generation could not be queued. Please try again.';
      await document.save();
      await this.aiService.saveSummary(
        document._id.toString(),
        user.id,
        type,
        SummaryGenerationStatus.FAILED,
        '',
        document.summaryGenerationError,
        undefined,
        user.role === UserRole.ADMIN,
      );
      this.logger.error(
        'Could not queue summary generation',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Summary generation could not be started',
      );
    }

    return this.toPublicDocument(document, true, true);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const document = await this.findAccessibleDocument(id, user);
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
    await this.storage.remove(document.storageKey);
    await this.aiService.deleteDocumentEmbeddings(
      document._id.toString(),
      user.id,
      user.role === UserRole.ADMIN,
    );
    await document.deleteOne();
  }

  private validateUpload(file: Express.Multer.File): UploadedDocumentMetadata {
    if (!file?.buffer || file.size < 1 || file.size > MAX_DOCUMENT_SIZE) {
      throw new BadRequestException('File must be between 1 byte and 5 MB');
    }
    if (file.buffer.length !== file.size) {
      throw new BadRequestException('Uploaded file size does not match its content');
    }

    const originalName = Array.from(basename(file.originalname.replace(/\\/g, '/')))
      .filter((character) => {
        const code = character.codePointAt(0);
        return code !== undefined && code > 0x1f && code !== 0x7f;
      })
      .join('')
      .trim();
    if (
      originalName.length === 0 ||
      originalName.length > MAX_ORIGINAL_NAME_LENGTH
    ) {
      throw new BadRequestException('Invalid original filename');
    }

    const extension = extname(originalName).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    let fileType: DocumentFileType;

    if (extension === '.pdf' && mimeType === 'application/pdf') {
      if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new BadRequestException('PDF file content is invalid');
      }
      fileType = DocumentFileType.PDF;
    } else if (extension === '.txt' && mimeType === 'text/plain') {
      fileType = DocumentFileType.TXT;
    } else {
      throw new BadRequestException(
        'Only matching PDF and TXT file extensions and MIME types are accepted',
      );
    }

    const title = parse(originalName).name
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_ORIGINAL_NAME_LENGTH);

    return {
      originalName,
      title: title || 'Untitled document',
      fileType,
    };
  }

  private accessibleFilter(
    user: AuthenticatedUser,
  ): { owner?: Types.ObjectId } {
    return user.role === UserRole.ADMIN
      ? {}
      : { owner: new Types.ObjectId(user.id) };
  }

  private async findAccessibleDocument(
    id: string,
    user: AuthenticatedUser,
  ): Promise<HydratedDocument<DocumentRecord>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Document not found');
    }

    const document = await this.documentModel
      .findOne({ _id: id, ...this.accessibleFilter(user) })
      .select('+storageKey +contentHash')
      .exec();
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  private async removeFileAfterFailedCreate(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.error(
        'Could not clean up a file after document creation failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private toPublicDocument(
    document: HydratedDocument<DocumentRecord>,
    includeExtractedText = false,
    includeSummaries = false,
  ): PublicDocument {
    const result: PublicDocument = {
      id: document._id.toString(),
      title: document.title,
      originalName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      summary: document.summary,
      summaries: includeSummaries
        ? Object.fromEntries(document.summaries ?? new Map())
        : {},
      summaryGenerationStatus: document.summaryGenerationStatus,
      summaryGenerationType: document.summaryGenerationType,
      owner: document.owner.toString(),
      status: document.status,
      ...(document.processingError
        ? { processingError: document.processingError }
        : {}),
      ...(document.summaryGenerationError
        ? { summaryGenerationError: document.summaryGenerationError }
        : {}),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
    if (includeExtractedText) {
      result.extractedText = document.extractedText;
    }
    return result;
  }
}
