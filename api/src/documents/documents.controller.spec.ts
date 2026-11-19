import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { SemanticSearchService } from '../ai/semantic-search.service.js';
import { SummaryType } from './summary.types.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

describe('Documents API routes', () => {
  let app: INestApplication;

  const user: AuthenticatedUser = {
    id: '507f1f77bcf86cd799439011',
    name: 'Document Owner',
    email: 'owner@example.com',
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const document = {
    id: '507f1f77bcf86cd799439012',
    title: 'notes',
    originalName: 'notes.txt',
    fileType: 'TXT',
    fileSize: 12,
    summary: '',
    owner: user.id,
    status: 'COMPLETED',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  const documentsService = {
    upload: vi.fn(),
    list: vi.fn(),
    getDashboardStats: vi.fn(),
    getById: vi.fn(),
    remove: vi.fn(),
    requestSummary: vi.fn(),
  };
  const jwtService = {
    verifyAsync: vi.fn(),
  };
  const usersService = {
    findById: vi.fn(),
  };
  const semanticSearchService = {
    search: vi.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: documentsService },
        { provide: SemanticSearchService, useValue: semanticSearchService },
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    jwtService.verifyAsync.mockImplementation(async (token: string) => {
      if (token === 'user-token') {
        return { sub: user.id };
      }
      throw new Error('Invalid token');
    });
    usersService.findById.mockResolvedValue(user);
    documentsService.upload.mockResolvedValue(document);
    documentsService.list.mockResolvedValue({
      items: [document],
      page: 2,
      limit: 5,
      total: 6,
      pages: 2,
    });
    documentsService.getDashboardStats.mockResolvedValue({
      totalDocuments: 6,
      summariesReady: 4,
      completedDocuments: 3,
      searches: 8,
    });
    documentsService.getById.mockResolvedValue({
      ...document,
      extractedText: 'Private text',
    });
    documentsService.remove.mockResolvedValue(undefined);
    documentsService.requestSummary.mockResolvedValue({
      ...document,
      summaryGenerationStatus: 'QUEUED',
      summaryGenerationType: SummaryType.DETAILED,
    });
    semanticSearchService.search.mockResolvedValue({
      query: 'project notes',
      limit: 5,
      results: [
        {
          documentId: document.id,
          title: document.title,
          snippet: 'Relevant project notes...',
          score: 0.91,
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a supported TXT upload without exposing storage keys', async () => {
    await request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Authorization', 'Bearer user-token')
      .attach('file', Buffer.from('Private text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.originalName).toBe('notes.txt');
        expect(body).not.toHaveProperty('storageKey');
        expect(body).not.toHaveProperty('path');
      });

    expect(documentsService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'notes.txt' }),
      user,
    );
  });

  it('rejects unsupported MIME types and files larger than 5 MB', async () => {
    await request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Authorization', 'Bearer user-token')
      .attach('file', Buffer.from('not a PDF'), {
        filename: 'notes.pdf',
        contentType: 'text/plain',
      })
      .expect(400);

    const oversizedFile = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
    await request(app.getHttpServer())
      .post('/api/documents/upload')
      .set('Authorization', 'Bearer user-token')
      .attach('file', oversizedFile, {
        filename: 'large.txt',
        contentType: 'text/plain',
      })
      .expect((response) => {
        expect([400, 413]).toContain(response.status);
      });

    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('supports paginated list, document detail and deletion routes', async () => {
    await request(app.getHttpServer())
      .get('/api/documents/stats')
      .set('Authorization', 'Bearer user-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          totalDocuments: 6,
          summariesReady: 4,
          completedDocuments: 3,
          searches: 8,
        });
      });
    expect(documentsService.getDashboardStats).toHaveBeenCalledWith(user);

    await request(app.getHttpServer())
      .get('/api/documents?page=2&limit=5')
      .set('Authorization', 'Bearer user-token')
      .expect(200);
    expect(documentsService.list).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ page: 2, limit: 5 }),
    );

    await request(app.getHttpServer())
      .get(`/api/documents/${document.id}`)
      .set('Authorization', 'Bearer user-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.extractedText).toBe('Private text');
        expect(body).not.toHaveProperty('storageKey');
      });
    expect(documentsService.getById).toHaveBeenCalledWith(document.id, user);

    await request(app.getHttpServer())
      .delete(`/api/documents/${document.id}`)
      .set('Authorization', 'Bearer user-token')
      .expect(204);
    expect(documentsService.remove).toHaveBeenCalledWith(document.id, user);
  });

  it('routes semantic search before the document-id route and requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/documents/search?q=project%20notes&limit=5')
      .set('Authorization', 'Bearer user-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.results[0]).toMatchObject({
          title: document.title,
          snippet: 'Relevant project notes...',
          score: 0.91,
        });
      });

    expect(semanticSearchService.search).toHaveBeenCalledWith(
      'project notes',
      user,
      5,
      { documentId: undefined, fileType: undefined },
    );

    await request(app.getHttpServer())
      .get(
        `/api/documents/search?q=project%20notes&documentId=${document.id}&fileType=PDF`,
      )
      .set('Authorization', 'Bearer user-token')
      .expect(200);
    expect(semanticSearchService.search).toHaveBeenLastCalledWith(
      'project notes',
      user,
      10,
      { documentId: document.id, fileType: 'PDF' },
    );

    await request(app.getHttpServer())
      .get('/api/documents/search?q=project%20notes')
      .expect(401);
  });

  it('queues an authenticated summary request and validates its format', async () => {
    await request(app.getHttpServer())
      .post(`/api/documents/${document.id}/summaries`)
      .set('Authorization', 'Bearer user-token')
      .send({ type: SummaryType.DETAILED })
      .expect(202);

    expect(documentsService.requestSummary).toHaveBeenCalledWith(
      document.id,
      user,
      SummaryType.DETAILED,
    );

    await request(app.getHttpServer())
      .post(`/api/documents/${document.id}/summaries`)
      .set('Authorization', 'Bearer user-token')
      .send({ type: 'MADE_UP' })
      .expect(400);

    expect(documentsService.requestSummary).toHaveBeenCalledOnce();
  });

  it('validates semantic search input and result limits', async () => {
    await request(app.getHttpServer())
      .get('/api/documents/search?q=x')
      .set('Authorization', 'Bearer user-token')
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/documents/search?q=project&documentId=invalid`)
      .set('Authorization', 'Bearer user-token')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/documents/search?q=project&fileType=DOC')
      .set('Authorization', 'Bearer user-token')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/documents/search?q=project&limit=51')
      .set('Authorization', 'Bearer user-token')
      .expect(400);

    expect(semanticSearchService.search).not.toHaveBeenCalled();
  });
});
