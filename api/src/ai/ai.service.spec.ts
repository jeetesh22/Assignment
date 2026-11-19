import { ServiceUnavailableException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import OpenAI from 'openai';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import {
  EMBEDDING_DIMENSIONS,
  OPENAI_CHAT_MODEL,
  OPENAI_EMBEDDING_MODEL,
} from './ai.constants.js';
import { AiService } from './ai.service.js';
import { PostgresVectorStore } from './postgres-vector-store.service.js';
import { SummaryType } from '../documents/summary.types.js';

describe('AiService', () => {
  let aiService: AiService;
  const openAi = {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
    embeddings: {
      create: vi.fn(),
    },
  };
  const documentModel = {
    updateOne: vi.fn(),
  };
  const vectorStore = {
    replaceDocumentEmbeddings: vi.fn(),
    deleteDocumentEmbeddings: vi.fn(),
    syncDocument: vi.fn(),
    updateDocumentStatus: vi.fn(),
    saveSummary: vi.fn(),
  };
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25);

  beforeEach(async () => {
    vi.clearAllMocks();
    openAi.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'A generated summary.' } }],
    });
    openAi.embeddings.create.mockImplementation(
      async ({ input }: { input: string | string[] }) => ({
        data: (Array.isArray(input) ? input : [input]).map((_, index) => ({
          index,
          embedding: vector,
        })),
      }),
    );
    documentModel.updateOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    vectorStore.replaceDocumentEmbeddings.mockImplementation(
      async (_documentId: string, _ownerId: string, chunks: unknown[]) =>
        chunks.map((_, index) => `embedding-${index}`),
    );
    vectorStore.deleteDocumentEmbeddings.mockResolvedValue(undefined);
    vectorStore.syncDocument.mockResolvedValue(undefined);
    vectorStore.updateDocumentStatus.mockResolvedValue(undefined);
    vectorStore.saveSummary.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: OpenAI, useValue: openAi },
        {
          provide: getModelToken(DocumentRecord.name),
          useValue: documentModel,
        },
        { provide: PostgresVectorStore, useValue: vectorStore },
      ],
    }).compile();

    aiService = module.get(AiService);
  });

  it('generates summaries with GPT-4o-mini', async () => {
    await expect(aiService.generateSummary('Document text.')).resolves.toBe(
      'A generated summary.',
    );

    expect(openAi.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: OPENAI_CHAT_MODEL,
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining('Document text.') }),
        ]),
      }),
    );
    expect(openAi.chat.completions.create.mock.calls[0][0].messages[0].content)
      .toContain('Do not invent');
  });

  it.each([
    [SummaryType.SHORT, '2 to 4 sentence'],
    [SummaryType.DETAILED, 'detailed, structured summary'],
    [SummaryType.BULLET_POINTS, 'bullet points'],
    [SummaryType.EXECUTIVE, 'executive summary'],
    [SummaryType.KEY_INSIGHTS, 'important insights'],
    [SummaryType.KEYWORDS, 'keywords or short phrases'],
  ])('generates a grounded %s summary format', async (type, instruction) => {
    await aiService.generateSummary('A source document with grounded facts.', type);

    expect(openAi.chat.completions.create.mock.calls[0][0].messages[1].content)
      .toContain(instruction);
    expect(openAi.chat.completions.create.mock.calls[0][0].messages[1].content)
      .toContain('A source document with grounded facts.');
  });

  it('splits long documents and reduces section summaries', async () => {
    const longText = 'paragraph text '.repeat(2_000);

    await aiService.generateSummary(longText);

    expect(openAi.chat.completions.create.mock.calls.length).toBeGreaterThan(2);
    for (const [request] of openAi.chat.completions.create.mock.calls) {
      const userMessage = request.messages[1].content;
      expect(userMessage.length).toBeLessThan(13_000);
    }
  });

  it('generates a text-embedding-3-small vector', async () => {
    const embedding = await aiService.generateEmbedding('One chunk of text.');

    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(openAi.embeddings.create).toHaveBeenCalledWith({
      model: OPENAI_EMBEDDING_MODEL,
      input: ['One chunk of text.'],
      encoding_format: 'float',
    });
  });

  it('stores chunk-level vectors in PostgreSQL and records their IDs', async () => {
    const documentId = new Types.ObjectId().toString();
    const ownerId = new Types.ObjectId().toString();
    const text = 'chunk text '.repeat(500);

    const count = await aiService.generateDocumentEmbeddings(
      documentId,
      ownerId,
      text,
    );

    expect(count).toBeGreaterThan(1);
    const records = vectorStore.replaceDocumentEmbeddings.mock.calls[0][2];
    expect(vectorStore.replaceDocumentEmbeddings).toHaveBeenCalledWith(
      documentId,
      ownerId,
      records,
      undefined,
    );
    expect(records).toHaveLength(count);
    expect(records[0]).toMatchObject({
      chunkIndex: 0,
      content: expect.any(String),
      embedding: vector,
      embeddingModel: OPENAI_EMBEDDING_MODEL,
      startChar: 0,
      endChar: expect.any(Number),
    });
    expect(documentModel.updateOne).toHaveBeenLastCalledWith(
      { _id: new Types.ObjectId(documentId) },
      {
        $set: {
          embeddingReferences: records.map(
            (_record: unknown, index: number) => `embedding-${index}`,
          ),
        },
      },
    );
  });

  it('deletes PostgreSQL vectors and clears document embedding references', async () => {
    const documentId = new Types.ObjectId().toString();
    const ownerId = new Types.ObjectId().toString();

    await aiService.deleteDocumentEmbeddings(documentId, ownerId);

    expect(vectorStore.deleteDocumentEmbeddings).toHaveBeenCalledWith(
      documentId,
      ownerId,
      false,
    );
    expect(documentModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(documentId) },
      { $set: { embeddingReferences: [] } },
    );
  });

  it('surfaces OpenAI failures instead of returning a fake result', async () => {
    openAi.embeddings.create.mockRejectedValue(new Error('provider offline'));

    await expect(
      aiService.generateEmbedding('A valid chunk'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('explains OpenAI embedding rate-limit and quota failures', async () => {
    openAi.embeddings.create.mockRejectedValue({ status: 429 });

    await expect(
      aiService.generateEmbedding('A valid chunk'),
    ).rejects.toThrow(/rate-limited or the account quota is exhausted/);
  });

  it('starts without an OpenAI client and fails AI operations explicitly', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: OpenAI, useValue: null },
        {
          provide: getModelToken(DocumentRecord.name),
          useValue: documentModel,
        },
        { provide: PostgresVectorStore, useValue: vectorStore },
      ],
    }).compile();

    await expect(
      module.get(AiService).generateEmbedding('A valid chunk'),
    ).rejects.toThrow(/OPENAI_API_KEY is not configured/);
  });
});
