import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../users/schemas/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  const usersService = {
    findByEmail: vi.fn(),
    findByEmailForAuthentication: vi.fn(),
    create: vi.fn(),
    syncIdentity: vi.fn(),
  };
  const jwtService = {
    signAsync: vi.fn(),
  };
  const publicUser = {
    id: '507f1f77bcf86cd799439011',
    name: 'Taylor User',
    email: 'taylor@example.com',
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(publicUser);
    usersService.syncIdentity.mockResolvedValue(undefined);
    jwtService.signAsync.mockResolvedValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('hashes registration passwords and always creates a USER', async () => {
    const password = 'Long-Enough-Pass-123';
    const result = await authService.register({
      name: ' Taylor User ',
      email: 'Taylor@Example.com',
      password,
    });

    const [createdUser] = usersService.create.mock.calls[0];
    expect(createdUser).toMatchObject({
      name: 'Taylor User',
      email: 'taylor@example.com',
      role: UserRole.USER,
    });
    expect(createdUser.password).not.toBe(password);
    expect(await bcrypt.compare(password, createdUser.password)).toBe(true);
    expect(result.user).toEqual(publicUser);
    expect(result.user).not.toHaveProperty('password');
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: publicUser.id,
    });
  });

  it('rejects duplicate email registration', async () => {
    usersService.findByEmail.mockResolvedValue(publicUser);

    await expect(
      authService.register({
        name: publicUser.name,
        email: publicUser.email,
        password: 'Long-Enough-Pass-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent duplicate-email insert to a conflict', async () => {
    usersService.create.mockRejectedValue({ code: 11000 });

    await expect(
      authService.register({
        name: publicUser.name,
        email: publicUser.email,
        password: 'Long-Enough-Pass-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login when the account does not exist', async () => {
    usersService.findByEmailForAuthentication.mockResolvedValue(null);

    await expect(
      authService.login({
        email: publicUser.email,
        password: 'Long-Enough-Pass-123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a token and a password-free user after valid login', async () => {
    const password = 'Long-Enough-Pass-123';
    const storedUser = {
      ...publicUser,
      _id: { toString: () => publicUser.id },
      password: await bcrypt.hash(password, 4),
    };
    usersService.findByEmailForAuthentication.mockResolvedValue(storedUser);

    const result = await authService.login({
      email: publicUser.email,
      password,
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toEqual(publicUser);
    expect(result.user).not.toHaveProperty('password');
    expect(usersService.syncIdentity).toHaveBeenCalledWith(storedUser);
  });
});
