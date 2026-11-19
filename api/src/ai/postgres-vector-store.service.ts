import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { EMBEDDING_DIMENSIONS } from './ai.constants.js';

const INSERT_BATCH_SIZE = 100;
const INITIAL_MIGRATION = '001_initial_schema.sql';
export const POSTGRES_POOL = Symbol('POSTGRES_POOL');

export type DatabaseRole = 'USER' | 'ADMIN';

export interface UserIdentityInput {
  externalId: string;
  name: string;
  email: string;
  role: DatabaseRole;
}

export interface DocumentMetadataInput {
  title: string;
  originalName: string;
  fileType: 'PDF' | 'TXT';
  fileSize: number;
  contentHash?: string;
  status?: string;
}

export interface VectorChunkInput {
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
  startChar: number;
  endChar: number;
}

export interface VectorSearchRow {
  documentId: string;
  content: string;
  score: number;
}

export interface VectorSearchFilters {
  documentId?: string;
  documentIds?: string[];
}

interface DatabaseActor {
  id: string;
  tenantId: string;
  role: DatabaseRole;
}

interface DatabaseActorRow {
  id: string;
  tenantId: string;
  role: string;
  deletedAt: Date | null;
}

interface DatabaseDocumentRow {
  id: string;
}

interface DatabaseRoleRow {
  id: string;
}

@Injectable()
export class PostgresVectorStore implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresVectorStore.name);
  private schemaReady: Promise<void> | null = null;

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool | null) {
    this.pool?.on('error', (error: Error) => {
      this.logger.error('PostgreSQL pool reported an idle client error', error.stack);
    });
  }

  async syncUser(input: UserIdentityInput): Promise<void> {
    this.validateObjectId(input.externalId, 'user');
    if (!this.pool) return;
    const pool = await this.ensureReady();

    try {
      await this.inTransaction(pool, async (client) => {
        await this.resolveActor(client, input.externalId, input);
      });
    } catch (error) {
      this.logDatabaseError('Could not synchronize the PostgreSQL user', error);
      this.rethrowDatabaseError(
        error,
        'PostgreSQL user storage is temporarily unavailable',
      );
    }
  }

  async syncDocument(
    documentId: string,
    ownerId: string,
    metadata: DocumentMetadataInput,
  ): Promise<void> {
    this.validateObjectId(documentId, 'document');
    this.validateObjectId(ownerId, 'owner');
    if (!this.pool) return;
    const pool = await this.ensureReady();

    try {
      await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(client, ownerId);
        await this.upsertDocument(client, actor, documentId, metadata);
      });
    } catch (error) {
      this.logDatabaseError('Could not synchronize the PostgreSQL document', error);
      this.rethrowDatabaseError(
        error,
        'PostgreSQL document storage is temporarily unavailable',
      );
    }
  }

  async updateDocumentStatus(
    documentId: string,
    ownerId: string,
    status: string,
  ): Promise<void> {
    this.validateObjectId(documentId, 'document');
    this.validateObjectId(ownerId, 'owner');
    if (!this.pool) return;
    const pool = await this.ensureReady();

    try {
      await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(client, ownerId);
        const result = await client.query(
          `UPDATE documents
           SET status = $1
           WHERE external_id = $2 AND owner_id = $3 AND deleted_at IS NULL`,
          [status, documentId, actor.id],
        );
        if (result.rowCount !== 1) {
          throw new ForbiddenException('Document is not available');
        }
      });
    } catch (error) {
      this.logDatabaseError('Could not update the PostgreSQL document status', error);
      this.rethrowDatabaseError(
        error,
        'PostgreSQL document storage is temporarily unavailable',
      );
    }
  }

  async saveSummary(
    documentId: string,
    actorId: string,
    summaryType: string,
    generationStatus: string,
    content = '',
    generationError = '',
    generationModel?: string,
    isAdmin = false,
  ): Promise<void> {
    this.validateObjectId(documentId, 'document');
    this.validateObjectId(actorId, 'actor');
    if (!this.pool) return;
    const pool = await this.ensureReady();

    try {
      await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(
          client,
          actorId,
          isAdmin ? { externalId: actorId, role: 'ADMIN' } : undefined,
        );
        const document = await this.findDocument(
          client,
          documentId,
          actor,
        );
        await client.query(
          `INSERT INTO summaries
            (tenant_id, document_id, summary_type, content, generation_status,
             generation_error, generation_model)
           VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7)
           ON CONFLICT (document_id, summary_type) DO UPDATE SET
             content = EXCLUDED.content,
             generation_status = EXCLUDED.generation_status,
             generation_error = EXCLUDED.generation_error,
             generation_model = EXCLUDED.generation_model,
             deleted_at = NULL`,
          [
            actor.tenantId,
            document.id,
            summaryType,
            content,
            generationStatus,
            generationError,
            generationModel ?? null,
          ],
        );
      });
    } catch (error) {
      this.logDatabaseError('Could not save the PostgreSQL document summary', error);
      this.rethrowDatabaseError(
        error,
        'PostgreSQL summary storage is temporarily unavailable',
      );
    }
  }

  async replaceDocumentEmbeddings(
    documentId: string,
    ownerId: string,
    chunks: VectorChunkInput[],
    metadata?: DocumentMetadataInput,
  ): Promise<string[]> {
    this.validateObjectId(documentId, 'document');
    this.validateObjectId(ownerId, 'owner');
    const embeddings = chunks.map((chunk) => ({
      id: randomUUID(),
      chunkId: randomUUID(),
      chunk,
      vector: this.serializeVector(chunk.embedding),
    }));
    const pool = await this.ensureReady();

    try {
      return await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(client, ownerId);
        const document = await this.upsertDocument(
          client,
          actor,
          documentId,
          metadata ?? {
            title: 'Document',
            originalName: 'document.txt',
            fileType: 'TXT',
            fileSize: 1,
            status: 'GENERATING_EMBEDDINGS',
          },
        );

        await client.query(
          'DELETE FROM document_embeddings WHERE document_id = $1',
          [document.id],
        );
        await client.query(
          'DELETE FROM document_chunks WHERE document_id = $1',
          [document.id],
        );
        for (let start = 0; start < embeddings.length; start += INSERT_BATCH_SIZE) {
          await this.insertBatch(
            client,
            actor.tenantId,
            document.id,
            embeddings.slice(start, start + INSERT_BATCH_SIZE),
          );
        }
        return embeddings.map(({ id }) => id);
      });
    } catch (error) {
      this.logDatabaseError(
        'Could not store document embeddings in PostgreSQL',
        error,
      );
      this.rethrowDatabaseError(
        error,
        'PostgreSQL vector storage is temporarily unavailable',
      );
    }
  }

  async deleteDocumentEmbeddings(
    documentId: string,
    actorId: string,
    isAdmin = false,
  ): Promise<void> {
    this.validateObjectId(documentId, 'document');
    this.validateObjectId(actorId, 'actor');
    if (!this.pool) return;
    const pool = await this.ensureReady();

    try {
      await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(
          client,
          actorId,
          isAdmin ? { externalId: actorId, role: 'ADMIN' } : undefined,
        );
        const result = await client.query(
          `UPDATE documents
           SET deleted_at = NOW()
           WHERE external_id = $1
             AND ($2::boolean OR owner_id = $3)
             AND deleted_at IS NULL`,
          [documentId, actor.role === 'ADMIN', actor.id],
        );
        if (result.rowCount !== 1) {
          throw new ForbiddenException('Document is not available');
        }
      });
    } catch (error) {
      this.logDatabaseError(
        'Could not soft-delete PostgreSQL document embeddings',
        error,
      );
      this.rethrowDatabaseError(
        error,
        'PostgreSQL vector storage is temporarily unavailable',
      );
    }
  }

  async assertReady(): Promise<void> {
    await this.ensureReady();
  }

  async search(
    queryVector: number[],
    externalUserId: string,
    limit: number,
    filters: VectorSearchFilters = {},
    isAdmin = false,
  ): Promise<VectorSearchRow[]> {
    const vector = this.serializeVector(queryVector);
    this.validateObjectId(externalUserId, 'user');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestException('Vector search limit is invalid');
    }
    if (filters.documentId) {
      this.validateObjectId(filters.documentId, 'document');
    }
    if (filters.documentIds?.length === 0) return [];
    for (const documentId of filters.documentIds ?? []) {
      this.validateObjectId(documentId, 'document');
    }

    const pool = await this.ensureReady();
    try {
      return await this.inTransaction(pool, async (client) => {
        const actor = await this.resolveActor(
          client,
          externalUserId,
          isAdmin ? { externalId: externalUserId, role: 'ADMIN' } : undefined,
        );
        const values: (string | number | string[])[] = [vector];
        const conditions = [
          'documents.deleted_at IS NULL',
          'document_chunks.deleted_at IS NULL',
          'document_embeddings.deleted_at IS NULL',
        ];
        if (!isAdmin) {
          values.push(actor.id);
          conditions.push(`documents.owner_id = $${values.length}`);
        }
        if (filters.documentId) {
          values.push(filters.documentId);
          conditions.push(`documents.external_id = $${values.length}`);
        }
        if (filters.documentIds) {
          values.push(filters.documentIds);
          conditions.push(
            `documents.external_id = ANY($${values.length}::varchar[])`,
          );
        }
        values.push(limit);

        const result = await client.query<VectorSearchRow>(
          `SELECT documents.external_id AS "documentId", document_chunks.content,
            1 - (document_embeddings.embedding <=> $1::vector) AS score
           FROM document_embeddings
           JOIN document_chunks
             ON document_chunks.id = document_embeddings.chunk_id
            AND document_chunks.document_id = document_embeddings.document_id
            AND document_chunks.tenant_id = document_embeddings.tenant_id
           JOIN documents
             ON documents.id = document_embeddings.document_id
            AND documents.tenant_id = document_embeddings.tenant_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY document_embeddings.embedding <=> $1::vector
           LIMIT $${values.length}`,
          values,
        );
        return result.rows;
      });
    } catch (error) {
      this.logDatabaseError('PostgreSQL vector search failed', error);
      this.rethrowDatabaseError(
        error,
        'Semantic search is temporarily unavailable',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private async resolveActor(
    client: PoolClient,
    externalId: string,
    identity?: UserIdentityInput | Pick<UserIdentityInput, 'externalId' | 'role'>,
  ): Promise<DatabaseActor> {
    const initialTenantId = randomUUID();
    await this.setContext(client, {
      externalId,
      tenantId: initialTenantId,
      userId: '',
      isAdmin: false,
    });
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      externalId,
    ]);

    const result = await client.query<DatabaseActorRow>(
      `SELECT users.id, users.tenant_id AS "tenantId",
          roles.name AS role, users.name, users.email,
          users.deleted_at AS "deletedAt"
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.external_id = $1`,
      [externalId],
    );

    if (result.rowCount === 0) {
      const requestedRole = identity?.role ?? 'USER';
      const role = await this.findRole(client, requestedRole);
      await client.query(
        'INSERT INTO tenants (id, name) VALUES ($1, $2)',
        [initialTenantId, 'Personal workspace'],
      );
      const details =
        identity && 'name' in identity
          ? {
              name: identity.name,
              email: identity.email,
            }
          : { name: null, email: null };
      const inserted = await client.query<{
        id: string;
        tenantId: string;
      }>(
        `INSERT INTO users (tenant_id, role_id, external_id, name, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id AS "tenantId"`,
        [
          initialTenantId,
          role.id,
          externalId,
          details.name,
          details.email,
        ],
      );
      const actor = inserted.rows[0];
      if (!actor) {
        throw new ServiceUnavailableException(
          'Could not establish the PostgreSQL user context',
        );
      }
      await this.setContext(client, {
        externalId,
        tenantId: actor.tenantId,
        userId: actor.id,
        isAdmin: requestedRole === 'ADMIN',
      });
      return {
        id: actor.id,
        tenantId: actor.tenantId,
        role: requestedRole,
      };
    } else if (identity) {
      const existing = result.rows[0];
      if (existing.deletedAt) {
        throw new ForbiddenException('User is not available');
      }
      const roleName = identity.role;
      const role = await this.findRole(client, roleName);
      const isExistingAdmin = existing.role === 'ADMIN';
      await this.setContext(client, {
        externalId,
        tenantId: existing.tenantId,
        userId: existing.id,
        isAdmin: isExistingAdmin,
      });
      if ('name' in identity) {
        await client.query(
          `UPDATE users
           SET name = $1, email = $2, role_id = $3, deleted_at = NULL
           WHERE id = $4
             AND (
               name IS DISTINCT FROM $1
               OR email IS DISTINCT FROM $2
               OR role_id IS DISTINCT FROM $3
               OR deleted_at IS NOT NULL
             )`,
          [identity.name, identity.email, role.id, existing.id],
        );
      } else {
        await client.query(
          `UPDATE users SET role_id = $1
           WHERE id = $2 AND role_id IS DISTINCT FROM $1`,
          [role.id, existing.id],
        );
      }
      await this.setContext(client, {
        externalId,
        tenantId: existing.tenantId,
        userId: existing.id,
        isAdmin: roleName === 'ADMIN',
      });
      return {
        id: existing.id,
        tenantId: existing.tenantId,
        role: roleName,
      };
    }

    const actor = result.rows[0];
    const role = actor.role === 'ADMIN' ? 'ADMIN' : 'USER';
    await this.setContext(client, {
      externalId,
      tenantId: actor.tenantId,
      userId: actor.id,
      isAdmin: role === 'ADMIN',
    });
    return { id: actor.id, tenantId: actor.tenantId, role };
  }

  private async findRole(
    client: PoolClient,
    roleName: DatabaseRole,
  ): Promise<DatabaseRoleRow> {
    const result = await client.query<DatabaseRoleRow>(
      `SELECT id FROM roles
       WHERE tenant_id IS NULL AND name = $1`,
      [roleName],
    );
    const role = result.rows[0];
    if (!role) {
      throw new ServiceUnavailableException(
        'Database role seed data is missing; rerun database migrations',
      );
    }
    return role;
  }

  private async upsertDocument(
    client: PoolClient,
    actor: DatabaseActor,
    externalId: string,
    metadata: DocumentMetadataInput,
  ): Promise<DatabaseDocumentRow> {
    const result = await client.query<DatabaseDocumentRow>(
      `INSERT INTO documents
        (tenant_id, owner_id, external_id, title, original_name, file_type,
         file_size, content_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (external_id) DO UPDATE SET
         title = EXCLUDED.title,
         original_name = EXCLUDED.original_name,
         file_type = EXCLUDED.file_type,
         file_size = EXCLUDED.file_size,
         content_hash = COALESCE(EXCLUDED.content_hash, documents.content_hash),
         status = EXCLUDED.status,
         deleted_at = NULL
       WHERE documents.owner_id = EXCLUDED.owner_id
       RETURNING id`,
      [
        actor.tenantId,
        actor.id,
        externalId,
        metadata.title,
        metadata.originalName,
        metadata.fileType,
        metadata.fileSize,
        metadata.contentHash ?? null,
        metadata.status ?? 'UPLOADED',
      ],
    );
    const document = result.rows[0];
    if (!document) {
      throw new ForbiddenException('Document is not available');
    }
    return document;
  }

  private async findDocument(
    client: PoolClient,
    externalId: string,
    actor: DatabaseActor,
  ): Promise<DatabaseDocumentRow> {
    const result = await client.query<DatabaseDocumentRow>(
      `SELECT id FROM documents
       WHERE external_id = $1
         AND ($2::boolean OR owner_id = $3)
         AND deleted_at IS NULL`,
      [externalId, actor.role === 'ADMIN', actor.id],
    );
    const document = result.rows[0];
    if (!document) {
      throw new ForbiddenException('Document is not available');
    }
    return document;
  }

  private async insertBatch(
    client: PoolClient,
    tenantId: string,
    documentId: string,
    batch: Array<{
      id: string;
      chunkId: string;
      chunk: VectorChunkInput;
      vector: string;
    }>,
  ): Promise<void> {
    const chunkValues: Array<string | number> = [];
    const chunkRows = batch.map(({ chunkId, chunk }, index) => {
      const offset = index * 7;
      chunkValues.push(
        chunkId,
        tenantId,
        documentId,
        chunk.chunkIndex,
        chunk.content,
        chunk.startChar,
        chunk.endChar,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4},
        $${offset + 5}, $${offset + 6}, $${offset + 7})`;
    });
    await client.query(
      `INSERT INTO document_chunks
        (id, tenant_id, document_id, chunk_index, content, start_char, end_char)
       VALUES ${chunkRows.join(', ')}`,
      chunkValues,
    );

    const embeddingValues: Array<string | number> = [];
    const embeddingRows = batch.map(
      ({ id, chunkId, chunk, vector }, index) => {
        const offset = index * 6;
        embeddingValues.push(
          id,
          tenantId,
          documentId,
          chunkId,
          vector,
          chunk.embeddingModel,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3},
          $${offset + 4}, $${offset + 5}::vector, $${offset + 6})`;
      },
    );
    await client.query(
      `INSERT INTO document_embeddings
        (id, tenant_id, document_id, chunk_id, embedding, embedding_model)
       VALUES ${embeddingRows.join(', ')}`,
      embeddingValues,
    );
  }

  private async setContext(
    client: PoolClient,
    context: {
      externalId: string;
      tenantId: string;
      userId: string;
      isAdmin: boolean;
    },
  ): Promise<void> {
    await client.query(
      `SELECT set_config('app.external_id', $1, TRUE),
        set_config('app.current_tenant_id', $2, TRUE),
        set_config('app.current_user_id', $3, TRUE),
        set_config('app.is_admin', $4, TRUE)`,
      [
        context.externalId,
        context.tenantId,
        context.userId,
        context.isAdmin ? 'true' : 'false',
      ],
    );
  }

  private async inTransaction<T>(
    pool: Pool,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger.error(
          'Could not roll back a PostgreSQL transaction',
          rollbackError instanceof Error ? rollbackError.stack : undefined,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureReady(): Promise<Pool> {
    const pool = this.pool;
    if (!pool) {
      throw new ServiceUnavailableException(
        'PostgreSQL is not configured; set POSTGRES_URL to enable document processing and semantic search',
      );
    }

    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const migration = await pool.query(
          'SELECT 1 FROM schema_migrations WHERE name = $1',
          [INITIAL_MIGRATION],
        );
        if (migration.rowCount !== 1) {
          throw new Error('The PostgreSQL schema migration has not been applied');
        }
      })().catch((error: unknown) => {
        this.schemaReady = null;
        this.logger.error(
          'PostgreSQL schema is unavailable; run npm run db:migrate',
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'PostgreSQL schema is unavailable; run npm run db:migrate',
        );
      });
    }
    await this.schemaReady;
    return pool;
  }

  private serializeVector(vector: number[]): string {
    if (
      vector.length !== EMBEDDING_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new BadRequestException(
        `Embedding vectors must contain ${EMBEDDING_DIMENSIONS} finite numbers`,
      );
    }
    return `[${vector.join(',')}]`;
  }

  private validateObjectId(value: string, label: string): void {
    if (!/^[a-f\d]{24}$/i.test(value)) {
      throw new BadRequestException(`Invalid ${label} ID`);
    }
  }

  private logDatabaseError(message: string, error: unknown): void {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : undefined,
    );
  }

  private rethrowDatabaseError(error: unknown, fallback: string): never {
    if (error instanceof ServiceUnavailableException) throw error;
    if (error instanceof ForbiddenException || error instanceof BadRequestException) {
      throw error;
    }
    throw new ServiceUnavailableException(fallback);
  }
}
