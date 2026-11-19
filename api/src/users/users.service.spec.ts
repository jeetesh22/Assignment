import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';
import { PostgresVectorStore } from '../ai/postgres-vector-store.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Taylor User',
    email: 'taylor@example.com',
    role: 'USER',
    searchCount: 9,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const searchCountQuery = {
    select: vi.fn(),
    exec: vi.fn(),
  };
  const userModel = {
    create: vi.fn(),
    updateOne: vi.fn(),
    findById: vi.fn(),
  };
  const postgres = { syncUser: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    userModel.create.mockResolvedValue(user);
    userModel.updateOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    });
    userModel.findById.mockReturnValue(searchCountQuery);
    searchCountQuery.select.mockReturnValue(searchCountQuery);
    searchCountQuery.exec.mockResolvedValue(user);
    postgres.syncUser.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: PostgresVectorStore, useValue: postgres },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('creates a user and returns only public fields', async () => {
    await expect(
      service.create({
        name: user.name,
        email: user.email,
        password: 'hashed-password',
        role: 'USER',
      }),
    ).resolves.toEqual({
      id: '507f1f77bcf86cd799439011',
      name: user.name,
      email: user.email,
      role: 'USER',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(postgres.syncUser).toHaveBeenCalledWith({
      externalId: '507f1f77bcf86cd799439011',
      name: user.name,
      email: user.email,
      role: 'USER',
    });
  });

  it('increments search counts without changing the user update timestamp', async () => {
    await service.incrementSearchCount('507f1f77bcf86cd799439011');

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      { $inc: { searchCount: 1 } },
      { timestamps: false },
    );
  });

  it('reads the persisted search count for a dashboard', async () => {
    await expect(
      service.getSearchCount('507f1f77bcf86cd799439011'),
    ).resolves.toBe(9);
    expect(userModel.findById).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
    );
    expect(searchCountQuery.select).toHaveBeenCalledWith('searchCount');
  });
});
