import { ServiceUnavailableException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  DocumentFileType,
  DocumentRecord,
  DocumentStatus,
} from '../documents/schemas/document.schema.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { AiService } from './ai.service.js';
import { MAX_SEMANTIC_SEARCH_RESULTS } from './ai.constants.js';
import { SemanticSearchService } from './semantic-search.service.js';
import { PostgresVectorStore } from './postgres-vector-store.service.js';

describe('SemanticSearchService', () => {
  const ownerId = '507f1f77bcf86cd799439011';
  const documentId = '507f1f77bcf86cd799439012';
  const secondDocumentId = '507f1f77bcf86cd799439013';
  const queryVector = [0.1, 0.2, 0.3];
  const aiService = {
    generateEmbedding: vi.fn(),
  };
  const vectorStore = {
    assertReady: vi.fn(),
    search: vi.fn(),
  };
  const usersService = {
    incrementSearchCount: vi.fn(),
  };
  const documentQuery = {
    select: vi.fn(),
    exec: vi.fn(),
  };
  const documentModel = {
    find: vi.fn(),
  };
  const user: AuthenticatedUser = {
    id: ownerId,
    name: 'Document Owner',
    email: 'owner@example.com',
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const admin: AuthenticatedUser = { ...user, role: UserRole.ADMIN };

  let service: SemanticSearchService;

  beforeEach(async () => {
    vi.clearAllMocks();
    aiService.generateEmbedding.mockResolvedValue(queryVector);
    usersService.incrementSearchCount.mockResolvedValue(undefined);
    vectorStore.assertReady.mockResolvedValue(undefined);
    vectorStore.search.mockResolvedValue([
      {
        documentId,
        content: 'Top-ranked matching document passage.',
        score: 0.94,
      },
      {
        documentId: secondDocumentId,
        content: 'Second matching document passage.',
        score: 0.82,
      },
    ]);
    documentQuery.select.mockReturnValue(documentQuery);
    documentQuery.exec.mockResolvedValue([
      { _id: new Types.ObjectId(documentId), title: 'Project Plan' },
      { _id: new Types.ObjectId(secondDocumentId), title: 'Meeting Notes' },
    ]);
    documentModel.find.mockReturnValue(documentQuery);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticSearchService,
        { provide: AiService, useValue: aiService },
        { provide: PostgresVectorStore, useValue: vectorStore },
        { provide: UsersService, useValue: usersService },
        {
          provide: getModelToken(DocumentRecord.name),
          useValue: documentModel,
        },
      ],
    }).compile();

    service = module.get(SemanticSearchService);
  });

  it('filters candidates by accessible document metadata before vector ranking', async () => {
    documentQuery.exec.mockResolvedValueOnce([
      { _id: new Types.ObjectId(documentId), title: 'Project Plan' },
    ]);

    const result = await service.search('project plan', user, 10, {
      fileType: DocumentFileType.PDF,
    });

    expect(documentModel.find).toHaveBeenCalledWith({
      status: DocumentStatus.COMPLETED,
      owner: new Types.ObjectId(ownerId),
      fileType: DocumentFileType.PDF,
    });
    expect(vectorStore.search).toHaveBeenCalledWith(
      queryVector,
      ownerId,
      200,
      { documentIds: [documentId] },
      false,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Project Plan');
  });

  it('avoids embedding a query when metadata filters match no documents', async () => {
    documentQuery.exec.mockResolvedValueOnce([]);

    await expect(
      service.search('project plan', user, 10, {
        fileType: DocumentFileType.PDF,
      }),
    ).resolves.toEqual({
      query: 'project plan',
      limit: 10,
      results: [],
    });

    expect(aiService.generateEmbedding).not.toHaveBeenCalled();
    expect(vectorStore.search).not.toHaveBeenCalled();
    expect(usersService.incrementSearchCount).toHaveBeenCalledWith(user.id);
  });

  it('filters vector candidates to a single selected document', async () => {
    await service.search('project plan', user, 10, { documentId });

    expect(vectorStore.search).toHaveBeenCalledWith(
      queryVector,
      ownerId,
      200,
      { documentId },
      false,
    );
    expect(documentModel.find).toHaveBeenCalledWith({
      _id: {
        $in: [new Types.ObjectId(documentId), new Types.ObjectId(secondDocumentId)],
      },
      status: DocumentStatus.COMPLETED,
      owner: new Types.ObjectId(ownerId),
    });
  });

  it('embeds the query, applies owner scope, and returns ranked snippets', async () => {
    const result = await service.search('project plan', user, 5);

    expect(aiService.generateEmbedding).toHaveBeenCalledWith('project plan');
    expect(vectorStore.search).toHaveBeenCalledWith(
      queryVector,
      ownerId,
      100,
      {},
      false,
    );
    expect(documentModel.find).toHaveBeenCalledWith({
      _id: {
        $in: [new Types.ObjectId(documentId), new Types.ObjectId(secondDocumentId)],
      },
      status: 'COMPLETED',
      owner: new Types.ObjectId(ownerId),
    });
    expect(documentQuery.select).toHaveBeenCalledWith('_id title');
    expect(result.results.map(({ score }) => score)).toEqual([0.94, 0.82]);
    expect(result.results[0]).toEqual({
      documentId,
      title: 'Project Plan',
      snippet: 'Top-ranked matching document passage.',
      score: 0.94,
    });
    expect(usersService.incrementSearchCount).toHaveBeenCalledWith(user.id);
  });

  it('allows admins to search all owners', async () => {
    await service.search('project plan', admin);

    expect(vectorStore.search).toHaveBeenCalledWith(
      queryVector,
      ownerId,
      200,
      {},
      true,
    );
    expect(documentModel.find).toHaveBeenCalledWith({
      _id: {
        $in: [new Types.ObjectId(documentId), new Types.ObjectId(secondDocumentId)],
      },
      status: 'COMPLETED',
    });
  });

  it('bounds result limits', async () => {
    await expect(
      service.search('project plan', user, MAX_SEMANTIC_SEARCH_RESULTS + 1),
    ).rejects.toThrow('Search limit must be between 1 and 50');
    expect(aiService.generateEmbedding).not.toHaveBeenCalled();
    expect(vectorStore.search).not.toHaveBeenCalled();
  });

  it('surfaces PostgreSQL vector-store availability errors', async () => {
    vectorStore.assertReady.mockRejectedValue(
      new ServiceUnavailableException(
        'PostgreSQL is not configured; set POSTGRES_URL',
      ),
    );

    await expect(service.search('project plan', user)).rejects.toThrow(
      /PostgreSQL is not configured/,
    );
    expect(aiService.generateEmbedding).not.toHaveBeenCalled();
    expect(vectorStore.search).not.toHaveBeenCalled();
  });
});
