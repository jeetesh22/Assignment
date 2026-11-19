import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import {
  DocumentFileType,
  DocumentRecord,
  DocumentStatus,
} from '../documents/schemas/document.schema.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { MAX_SEMANTIC_SEARCH_RESULTS } from './ai.constants.js';
import { AiService } from './ai.service.js';
import { PostgresVectorStore } from './postgres-vector-store.service.js';

export interface SemanticSearchFilters {
  documentId?: string;
  fileType?: DocumentFileType;
}

export interface SemanticSearchResult {
  documentId: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SemanticSearchResponse {
  query: string;
  limit: number;
  results: SemanticSearchResult[];
}

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly vectorStore: PostgresVectorStore,
    private readonly usersService: UsersService,
    @InjectModel(DocumentRecord.name)
    private readonly documentModel: Model<DocumentRecord>,
  ) {}

  async search(
    query: string,
    user: AuthenticatedUser,
    limit = 10,
    filters: SemanticSearchFilters = {},
  ): Promise<SemanticSearchResponse> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 2000) {
      throw new BadRequestException(
        'Search query must be between 2 and 2000 characters',
      );
    }
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_SEMANTIC_SEARCH_RESULTS
    ) {
      throw new BadRequestException(
        `Search limit must be between 1 and ${MAX_SEMANTIC_SEARCH_RESULTS}`,
      );
    }
    if (filters.documentId && !Types.ObjectId.isValid(filters.documentId)) {
      throw new BadRequestException('Search document ID is invalid');
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const ownerId = new Types.ObjectId(user.id);

    try {
      const baseDocumentFilter = {
        status: DocumentStatus.COMPLETED,
        ...(isAdmin ? {} : { owner: ownerId }),
        ...(filters.fileType ? { fileType: filters.fileType } : {}),
        ...(filters.documentId
          ? { _id: new Types.ObjectId(filters.documentId) }
          : {}),
      };
      const filteredDocuments = filters.fileType
        ? await this.documentModel
            .find(baseDocumentFilter)
            .select('_id title')
            .exec()
        : null;
      if (filteredDocuments && filteredDocuments.length === 0) {
        await this.usersService.incrementSearchCount(user.id);
        return { query: normalizedQuery, limit, results: [] };
      }

      await this.vectorStore.assertReady();
      const queryVector =
        await this.aiService.generateEmbedding(normalizedQuery);
      const candidates = await this.vectorStore.search(
        queryVector,
        user.id,
        Math.min(limit * 20, 1000),
        {
          ...(filters.documentId ? { documentId: filters.documentId } : {}),
          ...(filteredDocuments
            ? {
                documentIds: filteredDocuments.map((document) =>
                  document._id.toString(),
                ),
              }
            : {}),
        },
        isAdmin,
      );
      const documentIds = [
        ...new Set(
          candidates
            .map((candidate) => candidate.documentId)
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ];
      const documents =
        filteredDocuments ??
        (documentIds.length === 0
          ? []
          : await this.documentModel
              .find({
                ...baseDocumentFilter,
                _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
              })
              .select('_id title')
              .exec());
      const titleById = new Map(
        documents.map((document) => [
          document._id.toString(),
          document.title,
        ]),
      );
      const results: SemanticSearchResult[] = [];
      for (const candidate of candidates) {
        const title = titleById.get(candidate.documentId);
        if (title === undefined) continue;
        results.push({
          documentId: candidate.documentId,
          title,
          snippet: this.createSnippet(candidate.content),
          score: candidate.score,
        });
        if (results.length === limit) break;
      }

      await this.usersService.incrementSearchCount(user.id);
      return {
        query: normalizedQuery,
        limit,
        results,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        'Semantic search failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Semantic search is temporarily unavailable',
      );
    }
  }

  private createSnippet(content: string): string {
    const snippet = content.trim().slice(0, 500).trimEnd();
    return content.trim().length > snippet.length ? `${snippet}...` : snippet;
  }
}
