import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { DocumentsService } from '../documents/documents.service.js';
import { DocumentRecord } from '../documents/schemas/document.schema.js';
import { User, UserRole } from '../users/schemas/user.schema.js';
import { AdminService } from './admin.service.js';

describe('AdminService', () => {
  let service: AdminService;
  const userQuery = {
    select: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    exec: vi.fn(),
  };
  const userModel = { find: vi.fn(), countDocuments: vi.fn() };
  const documentModel = { countDocuments: vi.fn() };
  const documentsService = { list: vi.fn(), requestSummary: vi.fn() };
  const admin: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    name: 'Platform Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    userQuery.select.mockReturnValue(userQuery);
    userQuery.sort.mockReturnValue(userQuery);
    userQuery.skip.mockReturnValue(userQuery);
    userQuery.limit.mockReturnValue(userQuery);
    userQuery.exec.mockResolvedValue([]);
    userModel.find.mockReturnValue(userQuery);
    userModel.countDocuments.mockReturnValue({
      exec: vi.fn().mockResolvedValue(11),
    });
    documentsService.list.mockResolvedValue({
      items: [],
      page: 1,
      limit: 10,
      total: 0,
      pages: 0,
    });
    documentsService.requestSummary.mockResolvedValue({ id: 'document-id' });
    documentModel.countDocuments.mockImplementation((filter?: { status?: string }) => ({
      exec: vi.fn().mockResolvedValue(
        filter?.status === 'COMPLETED'
          ? 14
          : filter?.status === 'FAILED'
            ? 2
            : 20,
      ),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(DocumentRecord.name),
          useValue: documentModel,
        },
        { provide: DocumentsService, useValue: documentsService },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('calculates aggregate statistics from MongoDB', async () => {
    await expect(service.getStatistics()).resolves.toEqual({
      totalUsers: 11,
      totalDocuments: 20,
      completedDocuments: 14,
      failedDocuments: 2,
    });

    expect(userModel.countDocuments).toHaveBeenCalledOnce();
    expect(documentModel.countDocuments).toHaveBeenCalledTimes(3);
  });

  it('lists public user fields with pagination and excludes passwords', async () => {
    const userId = new Types.ObjectId();
    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    userQuery.exec.mockResolvedValueOnce([
      {
        _id: userId,
        name: 'Kriscent Admin',
        email: 'admin@kriscent.local',
        role: UserRole.ADMIN,
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    await expect(service.listUsers({ page: 2, limit: 10 })).resolves.toEqual({
      items: [
        {
          id: userId.toString(),
          name: 'Kriscent Admin',
          email: 'admin@kriscent.local',
          role: UserRole.ADMIN,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      page: 2,
      limit: 10,
      total: 11,
      pages: 2,
    });
    expect(userQuery.select).toHaveBeenCalledWith(
      'name email role createdAt updatedAt',
    );
    expect(userQuery.skip).toHaveBeenCalledWith(10);
  });

  it('lists documents through the owner-aware document service', async () => {
    const query = { page: 1, limit: 10 };
    const result = await service.listDocuments(admin, query);

    expect(documentsService.list).toHaveBeenCalledWith(admin, query);
    expect(result).toMatchObject({ page: 1, limit: 10, items: [] });
  });

  it('queues short-summary regeneration through the document service', async () => {
    await expect(
      service.refreshSummary('document-id', admin),
    ).resolves.toEqual({ id: 'document-id' });

    expect(documentsService.requestSummary).toHaveBeenCalledWith(
      'document-id',
      admin,
      'SHORT',
    );
  });

});
