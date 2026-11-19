import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Readable } from 'node:stream';
import { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { AiQueueService } from '../ai/ai-queue.service.js';
import { AiService } from '../ai/ai.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import { DocumentsService } from './documents.service.js';
import {
  DocumentFileType,
  DocumentRecord,
  DocumentStatus,
} from './schemas/document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from './summary.types.js';

describe('DocumentsService', () => {
  let documentsService: DocumentsService;
  let lastCreatedDocument: ReturnType<typeof createMockDocument>;

  const owner: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    name: 'Document Owner',
    email: 'owner@example.com',
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const admin: AuthenticatedUser = {
    ...owner,
    id: new Types.ObjectId().toString(),
    role: UserRole.ADMIN,
  };
  const storage = {
    store: vi.fn(),
    remove: vi.fn(),
  };
  const aiQueue = {
    enqueueDocument: vi.fn(),
    enqueueSummary: vi.fn(),
  };
  const aiService = {
    deleteDocumentEmbeddings: vi.fn(),
    syncDocumentMetadata: vi.fn(),
    updateDocumentStatus: vi.fn(),
    saveSummary: vi.fn(),
  };
  const usersService = {
    getSearchCount: vi.fn(),
  };
  const model = {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  };
  const duplicateQuery = {
    select: vi.fn(),
    exec: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    storage.store.mockResolvedValue(
      'f07512c9-54ac-4c6f-9f4b-99d5a5a56891.txt',
    );
    storage.remove.mockResolvedValue(undefined);
    aiQueue.enqueueDocument.mockResolvedValue(undefined);
    aiQueue.enqueueSummary.mockResolvedValue(undefined);
    aiService.deleteDocumentEmbeddings.mockResolvedValue(undefined);
    aiService.syncDocumentMetadata.mockResolvedValue(undefined);
    aiService.updateDocumentStatus.mockResolvedValue(undefined);
    aiService.saveSummary.mockResolvedValue(undefined);
    usersService.getSearchCount.mockResolvedValue(0);
    duplicateQuery.select.mockReturnValue(duplicateQuery);
    duplicateQuery.exec.mockResolvedValue(null);
    model.findOne.mockReturnValue(duplicateQuery);
    model.create.mockImplementation(async (input: Partial<DocumentRecord>) => {
      lastCreatedDocument = createMockDocument(input);
      return lastCreatedDocument;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getModelToken(DocumentRecord.name),
          useValue: model,
        },
        { provide: DocumentStorageService, useValue: storage },
        { provide: AiQueueService, useValue: aiQueue },
        { provide: AiService, useValue: aiService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    documentsService = module.get(DocumentsService);
  });

  it('stores an owned TXT document and queues extraction asynchronously', async () => {
    const file = createUploadFile('notes.txt', 'text/plain', 'Private text');
    const result = await documentsService.upload(file, owner);

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'notes',
        originalName: 'notes.txt',
        fileType: DocumentFileType.TXT,
        owner: expect.any(Types.ObjectId),
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: DocumentStatus.UPLOADED,
      }),
    );
    expect(storage.store).toHaveBeenCalledWith(
      file.buffer,
      DocumentFileType.TXT,
    );
    expect(aiService.syncDocumentMetadata).toHaveBeenCalledWith(
      lastCreatedDocument._id.toString(),
      owner.id,
      expect.objectContaining({
        title: 'notes',
        originalName: 'notes.txt',
        fileType: DocumentFileType.TXT,
        fileSize: file.size,
        status: DocumentStatus.UPLOADED,
      }),
    );
    expect(lastCreatedDocument.status).toBe(DocumentStatus.UPLOADED);
    expect(aiQueue.enqueueDocument).toHaveBeenCalledWith(
      lastCreatedDocument._id.toString(),
    );
    expect(lastCreatedDocument.extractedText).toBe('');
    expect(result.status).toBe(DocumentStatus.UPLOADED);
    expect(result.extractedText).toBeUndefined();
    expect(result).not.toHaveProperty('storageKey');
  });

  it('rejects duplicate document content for the same owner before storing it', async () => {
    duplicateQuery.exec.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
    });

    await expect(
      documentsService.upload(
        createUploadFile('notes-copy.txt', 'text/plain', 'Private text'),
        owner,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(model.findOne).toHaveBeenCalledWith({
      owner: expect.any(Types.ObjectId),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(model.findOne.mock.calls[0][0].owner.toString()).toBe(owner.id);
    expect(storage.store).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('cleans up storage and reports a conflict when concurrent uploads race', async () => {
    model.create.mockRejectedValueOnce({ code: 11000 });

    await expect(
      documentsService.upload(
        createUploadFile('notes.txt', 'text/plain', 'Private text'),
        owner,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.store).toHaveBeenCalledOnce();
    expect(storage.remove).toHaveBeenCalledWith(
      'f07512c9-54ac-4c6f-9f4b-99d5a5a56891.txt',
    );
  });

  it('marks a stored document failed when processing cannot be queued', async () => {
    aiQueue.enqueueDocument.mockRejectedValueOnce(new Error('queue offline'));

    await expect(
      documentsService.upload(
        createUploadFile('notes.txt', 'text/plain', 'Private text'),
        owner,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(lastCreatedDocument.status).toBe(DocumentStatus.FAILED);
    expect(lastCreatedDocument.processingError).toContain('could not be queued');
    expect(lastCreatedDocument.save).toHaveBeenCalledOnce();
  });

  it('queues an on-demand summary for an accessible processed document', async () => {
    const document = createMockDocument({
      status: DocumentStatus.COMPLETED,
      extractedText: 'Extracted source content.',
    });
    duplicateQuery.exec.mockResolvedValueOnce(document);

    const result = await documentsService.requestSummary(
      document._id.toString(),
      owner,
      SummaryType.DETAILED,
    );

    expect(aiQueue.enqueueSummary).toHaveBeenCalledWith(
      document._id.toString(),
      SummaryType.DETAILED,
    );
    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.QUEUED,
    );
    expect(document.summaryGenerationType).toBe(SummaryType.DETAILED);
    expect(document.save).toHaveBeenCalledOnce();
    expect(result.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.QUEUED,
    );
    expect(result.extractedText).toBe('Extracted source content.');
  });

  it('rejects summary requests before extraction is complete', async () => {
    const document = createMockDocument({
      status: DocumentStatus.EXTRACTING,
    });
    duplicateQuery.exec.mockResolvedValueOnce(document);

    await expect(
      documentsService.requestSummary(
        document._id.toString(),
        owner,
        SummaryType.SHORT,
      ),
    ).rejects.toThrow('Wait for document processing to finish');
    expect(aiQueue.enqueueSummary).not.toHaveBeenCalled();
  });

  it('records a safe failure if summary generation cannot be queued', async () => {
    const document = createMockDocument({
      status: DocumentStatus.COMPLETED,
      extractedText: 'Extracted source content.',
    });
    duplicateQuery.exec.mockResolvedValueOnce(document);
    aiQueue.enqueueSummary.mockRejectedValueOnce(new Error('queue offline'));

    await expect(
      documentsService.requestSummary(
        document._id.toString(),
        owner,
        SummaryType.KEYWORDS,
      ),
    ).rejects.toThrow('Summary generation could not be started');

    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.FAILED,
    );
    expect(document.summaryGenerationError).toContain(
      'could not be queued',
    );
    expect(document.save).toHaveBeenCalledTimes(2);
  });

  it('rejects file content that does not match the declared PDF type', async () => {
    await expect(
      documentsService.upload(
        createUploadFile('spoof.pdf', 'application/pdf', 'not a pdf'),
        owner,
      ),
    ).rejects.toThrow('PDF file content is invalid');
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('scopes paginated listing to the owner and omits extracted text', async () => {
    const query = createFindQuery([]);
    model.find.mockReturnValue(query);
    model.countDocuments.mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    });

    await documentsService.list(owner, { page: 2, limit: 5 });

    expect(model.find.mock.calls[0][0].owner.toString()).toBe(owner.id);
    expect(query.select).toHaveBeenCalledWith('-extractedText -summaries');
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it('allows admins to list all documents', async () => {
    model.find.mockReturnValue(createFindQuery([]));
    model.countDocuments.mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    });

    await documentsService.list(admin, { page: 1, limit: 20 });

    expect(model.find).toHaveBeenCalledWith({});
  });

  it('returns owner-scoped dashboard counts with successful search totals', async () => {
    model.countDocuments
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(7) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(3) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(2) });
    usersService.getSearchCount.mockResolvedValueOnce(12);

    await expect(documentsService.getDashboardStats(owner)).resolves.toEqual({
      totalDocuments: 7,
      summariesReady: 3,
      completedDocuments: 2,
      searches: 12,
    });

    const ownerFilter = { owner: expect.any(Types.ObjectId) };
    expect(model.countDocuments).toHaveBeenNthCalledWith(1, ownerFilter);
    expect(model.countDocuments).toHaveBeenNthCalledWith(2, {
      ...ownerFilter,
      summaryGenerationStatus: SummaryGenerationStatus.COMPLETED,
    });
    expect(model.countDocuments).toHaveBeenNthCalledWith(3, {
      ...ownerFilter,
      status: DocumentStatus.COMPLETED,
    });
    expect(usersService.getSearchCount).toHaveBeenCalledWith(owner.id);
  });

  it('hides other users documents and permits owner/admin deletion', async () => {
    const query = {
      select: vi.fn(),
      exec: vi.fn().mockResolvedValue(null),
    };
    query.select.mockReturnValue(query);
    model.findOne.mockReturnValue(query);

    await expect(
      documentsService.getById(
        '507f1f77bcf86cd799439011',
        owner,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.remove).not.toHaveBeenCalled();

    const ownedDocument = createMockDocument({
      owner: new Types.ObjectId(owner.id),
    });
    query.exec.mockResolvedValue(ownedDocument);
    await documentsService.remove('507f1f77bcf86cd799439011', owner);

    const ownerFilter = model.findOne.mock.calls.at(-1)?.[0];
    expect(ownerFilter.owner.toString()).toBe(owner.id);
    expect(query.select).toHaveBeenCalledWith('+storageKey +contentHash');
    expect(storage.remove).toHaveBeenCalledWith(ownedDocument.storageKey);
    expect(aiService.deleteDocumentEmbeddings).toHaveBeenCalledWith(
      ownedDocument._id.toString(),
      owner.id,
      false,
    );
    expect(ownedDocument.deleteOne).toHaveBeenCalled();

    const anotherUsersDocument = createMockDocument({
      owner: new Types.ObjectId(owner.id),
    });
    query.exec.mockResolvedValue(anotherUsersDocument);
    await documentsService.remove('507f1f77bcf86cd799439011', admin);

    expect(model.findOne).toHaveBeenLastCalledWith({
      _id: '507f1f77bcf86cd799439011',
    });
    expect(storage.remove).toHaveBeenCalledWith(
      anotherUsersDocument.storageKey,
    );
    expect(aiService.deleteDocumentEmbeddings).toHaveBeenLastCalledWith(
      anotherUsersDocument._id.toString(),
      admin.id,
      true,
    );
    expect(anotherUsersDocument.deleteOne).toHaveBeenCalled();
  });
});

function createMockDocument(input: Partial<DocumentRecord>) {
  const document = {
    _id: new Types.ObjectId(),
    title: input.title ?? 'notes',
    originalName: input.originalName ?? 'notes.txt',
    fileType: input.fileType ?? DocumentFileType.TXT,
    fileSize: input.fileSize ?? 12,
    extractedText: input.extractedText ?? '',
    summary: input.summary ?? '',
    summaries: input.summaries ?? new Map(),
    summaryGenerationStatus:
      input.summaryGenerationStatus ?? SummaryGenerationStatus.IDLE,
    summaryGenerationType: input.summaryGenerationType ?? SummaryType.SHORT,
    summaryGenerationError: input.summaryGenerationError ?? '',
    contentHash: input.contentHash ?? 'a'.repeat(64),
    embeddingReferences: input.embeddingReferences ?? [],
    processingError: input.processingError ?? '',
    owner:
      input.owner ?? new Types.ObjectId('507f1f77bcf86cd799439011'),
    status: input.status ?? DocumentStatus.UPLOADED,
    storageKey:
      input.storageKey ?? 'f07512c9-54ac-4c6f-9f4b-99d5a5a56891.txt',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    save: vi.fn(),
    deleteOne: vi.fn(),
  };
  document.save.mockImplementation(async () => document);
  document.deleteOne.mockResolvedValue(undefined);
  return document;
}

function createFindQuery(items: ReturnType<typeof createMockDocument>[]) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    exec: vi.fn().mockResolvedValue(items),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function createUploadFile(
  originalname: string,
  mimetype: string,
  content: string,
): Express.Multer.File {
  const buffer = Buffer.from(content);
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    stream: Readable.from(buffer),
    destination: '',
    filename: '',
    path: '',
    buffer,
  };
}
