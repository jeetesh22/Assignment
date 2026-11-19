import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { POSTGRES_POOL, PostgresVectorStore } from './postgres-vector-store.service.js';
import { EMBEDDING_DIMENSIONS } from './ai.constants.js';

describe('PostgresVectorStore', () => {
  const ownerId = '507f1f77bcf86cd799439011';
  const documentId = '507f1f77bcf86cd799439012';
  const userUuid = '6b9b84a4-2022-4e84-ae11-337437c2e9cc';
  const tenantUuid = '71c6d723-ef38-495a-a19a-90f731d9e408';
  const documentUuid = 'c41b9948-f5e2-4bc8-9d06-b7d1ef2a2a12';
  const roleUuid = '1cfdce49-54a2-4e30-aac5-33accf56c2e5';
  const actorRow = {
    id: userUuid,
    tenantId: tenantUuid,
    role: 'USER',
    deletedAt: null,
  };
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    on: vi.fn(),
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  };
  let store: PostgresVectorStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    client.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT users.id')) {
        return { rows: [actorRow], rowCount: 1 };
      }
      if (query.includes('SELECT id FROM roles')) {
        return { rows: [{ id: roleUuid }], rowCount: 1 };
      }
      if (query.includes('INSERT INTO documents')) {
        return { rows: [{ id: documentUuid }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValue({ rows: [{}], rowCount: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresVectorStore,
        { provide: POSTGRES_POOL, useValue: pool },
      ],
    }).compile();
    store = module.get(PostgresVectorStore);
  });

  it('stores normalized chunks and vectors under a tenant transaction', async () => {
    const ids = await store.replaceDocumentEmbeddings(
      documentId,
      ownerId,
      [createChunk()],
      createMetadata(),
    );

    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const statements = client.query.mock.calls.map(([query]) => query);
    expect(statements[0]).toBe('BEGIN');
    expect(statements).toContain(
      'DELETE FROM document_embeddings WHERE document_id = $1',
    );
    expect(statements).toContain(
      'DELETE FROM document_chunks WHERE document_id = $1',
    );
    expect(statements.some((query: string) =>
      query.includes('INSERT INTO document_chunks'),
    )).toBe(true);
    expect(statements.some((query: string) =>
      query.includes('INSERT INTO document_embeddings'),
    )).toBe(true);
    expect(statements.at(-1)).toBe('COMMIT');

    const contextCall = client.query.mock.calls
      .filter(
        ([query, values]) =>
          query.includes("set_config('app.external_id'") &&
          values[2] === userUuid,
      )
      .at(-1);
    expect(contextCall?.[1]).toEqual([
      ownerId,
      tenantUuid,
      userUuid,
      'false',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      ['001_initial_schema.sql'],
    );
  });

  it('creates a personal tenant and user mapping when syncing an identity', async () => {
    client.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT users.id')) {
        return { rows: [], rowCount: 0 };
      }
      if (query.includes('SELECT id FROM roles')) {
        return { rows: [{ id: roleUuid }], rowCount: 1 };
      }
      if (query.includes('INSERT INTO users')) {
        return { rows: [{ ...actorRow, id: userUuid }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await store.syncUser({
      externalId: ownerId,
      name: 'Owner',
      email: 'owner@example.com',
      role: 'USER',
    });

    expect(
      client.query.mock.calls.some(([query]) =>
        query.includes('INSERT INTO tenants'),
      ),
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([query]) =>
        query.includes('INSERT INTO users'),
      ),
    ).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('rolls back and reports a service error when vector insertion fails', async () => {
    client.query.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO document_embeddings')) {
        throw new Error('database connection dropped');
      }
      if (query.includes('SELECT users.id')) {
        return { rows: [actorRow], rowCount: 1 };
      }
      if (query.includes('INSERT INTO documents')) {
        return { rows: [{ id: documentUuid }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      store.replaceDocumentEmbeddings(
        documentId,
        ownerId,
        [createChunk()],
        createMetadata(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('scopes vector searches by owner and excludes deleted documents', async () => {
    client.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT documents.external_id')) {
        return {
          rows: [{ documentId, content: 'Relevant passage', score: 0.9 }],
          rowCount: 1,
        };
      }
      if (query.includes('SELECT users.id')) {
        return { rows: [actorRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      store.search(createVector(), ownerId, 20),
    ).resolves.toEqual([
      { documentId, content: 'Relevant passage', score: 0.9 },
    ]);
    const searchCall = client.query.mock.calls.find(([query]) =>
      query.includes('SELECT documents.external_id'),
    );
    expect(searchCall?.[0]).toContain('documents.owner_id = $2');
    expect(searchCall?.[0]).toContain('documents.deleted_at IS NULL');
    expect(searchCall?.[1][1]).toBe(userUuid);
    expect(searchCall?.[1][2]).toBe(20);
  });

  it('uses the database admin context for cross-tenant search', async () => {
    await store.search(createVector(), ownerId, 10, {}, true);

    const contextCall = client.query.mock.calls
      .filter(
        ([query, values]) =>
          query.includes("set_config('app.external_id'") &&
          values[2] === userUuid,
      )
      .at(-1);
    const searchCall = client.query.mock.calls.find(([query]) =>
      query.includes('SELECT documents.external_id'),
    );
    expect(contextCall?.[1]).toEqual([
      ownerId,
      tenantUuid,
      userUuid,
      'true',
    ]);
    expect(searchCall?.[0]).not.toContain('documents.owner_id =');
  });

  it('refuses to soft-delete a document outside the actor scope', async () => {
    client.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT users.id')) {
        return { rows: [actorRow], rowCount: 1 };
      }
      if (query.includes('UPDATE documents')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      store.deleteDocumentEmbeddings(documentId, ownerId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const updateCall = client.query.mock.calls.find(([query]) =>
      query.includes('UPDATE documents'),
    );
    expect(updateCall?.[0]).toContain(
      'AND ($2::boolean OR owner_id = $3)',
    );
    expect(updateCall?.[1]).toEqual([documentId, false, userUuid]);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('fails clearly when PostgreSQL is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresVectorStore,
        { provide: POSTGRES_POOL, useValue: null },
      ],
    }).compile();
    const unconfiguredStore = module.get(PostgresVectorStore);

    await expect(
      unconfiguredStore.search(createVector(), ownerId, 5),
    ).rejects.toThrow(/POSTGRES_URL/);
  });

  it('allows document cleanup when PostgreSQL is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresVectorStore,
        { provide: POSTGRES_POOL, useValue: null },
      ],
    }).compile();
    const unconfiguredStore = module.get(PostgresVectorStore);

    await expect(
      unconfiguredStore.deleteDocumentEmbeddings(documentId, ownerId),
    ).resolves.toBeUndefined();
  });

  it('requires the versioned schema migration before using PostgreSQL', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      store.search(createVector(), ownerId, 5),
    ).rejects.toThrow(/run npm run db:migrate/);
  });
});

function createVector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
}

function createChunk() {
  return {
    chunkIndex: 0,
    content: 'Embedding content',
    embedding: createVector(),
    embeddingModel: 'text-embedding-3-small',
    startChar: 0,
    endChar: 17,
  };
}

function createMetadata() {
  return {
    title: 'Document',
    originalName: 'document.txt',
    fileType: 'TXT' as const,
    fileSize: 17,
    status: 'GENERATING_EMBEDDINGS',
  };
}
