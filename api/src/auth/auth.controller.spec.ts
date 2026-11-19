import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthService } from './auth.service.js';
import { AdminController } from '../admin/admin.controller.js';
import { AdminService } from '../admin/admin.service.js';
import { AuthController } from './auth.controller.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';

describe('Authentication and RBAC APIs', () => {
  let app: INestApplication;

  const user = {
    id: '507f1f77bcf86cd799439011',
    name: 'Taylor User',
    email: 'taylor@example.com',
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const admin = {
    ...user,
    id: '507f1f77bcf86cd799439012',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };
  const authService = {
    register: vi.fn(),
    login: vi.fn(),
  };
  const jwtService = {
    verifyAsync: vi.fn(),
  };
  const usersService = {
    findById: vi.fn(),
  };
  const adminService = {
    getStatistics: vi.fn(),
    refreshSummary: vi.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, AdminController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: AdminService, useValue: adminService },
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
    authService.register.mockResolvedValue({
      accessToken: 'new.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    });
    authService.login.mockResolvedValue({
      accessToken: 'new.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    });
    jwtService.verifyAsync.mockImplementation(async (token: string) => {
      if (token === 'user-token') {
        return { sub: user.id };
      }
      if (token === 'admin-token') {
        return { sub: admin.id };
      }
      throw new Error('Invalid token');
    });
    usersService.findById.mockImplementation(async (id: string) => {
      if (id === user.id) {
        return user;
      }
      if (id === admin.id) {
        return admin;
      }
      return null;
    });
    adminService.getStatistics.mockResolvedValue({
      totalUsers: 2,
      totalDocuments: 3,
      completedDocuments: 1,
      failedDocuments: 0,
    });
    adminService.refreshSummary.mockResolvedValue({
      id: '507f1f77bcf86cd799439013',
      summaryGenerationStatus: 'QUEUED',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and rejects a client-supplied role', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: user.name,
        email: user.email,
        password: 'Long-Enough-Pass-123',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: user.name,
        email: user.email,
        password: 'Long-Enough-Pass-123',
        role: UserRole.ADMIN,
      })
      .expect(400);

    expect(authService.register).toHaveBeenCalledTimes(1);
  });

  it('logs in with a valid request and rejects invalid input', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Long-Enough-Pass-123' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessToken).toBe('new.jwt.token');
        expect(body.user).not.toHaveProperty('password');
      });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('returns the profile only for a valid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer user-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe(user.email);
        expect(body.role).toBe(UserRole.USER);
        expect(body).not.toHaveProperty('password');
      });
  });

  it('denies USER access to admin routes and permits ADMIN access', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/access')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/admin/access')
      .set('Authorization', 'Bearer user-token')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/access')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.role).toBe(UserRole.ADMIN);
      });
  });

  it('protects admin statistics with the ADMIN role', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer user-token')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          totalUsers: 2,
          totalDocuments: 3,
          completedDocuments: 1,
          failedDocuments: 0,
        });
      });
    expect(adminService.getStatistics).toHaveBeenCalledOnce();
  });

  it('restricts admin summary regeneration to administrators', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/refresh-summary/507f1f77bcf86cd799439013')
      .set('Authorization', 'Bearer user-token')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/admin/refresh-summary/507f1f77bcf86cd799439013')
      .set('Authorization', 'Bearer admin-token')
      .expect(202);

    expect(adminService.refreshSummary).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439013',
      expect.objectContaining({ id: admin.id, role: UserRole.ADMIN }),
    );
  });
});
