import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UsersService } from '../users/users.service.js';
import { PublicUser } from '../users/user.types.js';
import { UserRole } from '../users/schemas/user.schema.js';

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function validateBcryptPasswordLength(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('Password must not exceed 72 bytes');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponse> {
    validateBcryptPasswordLength(input.password);
    const email = input.email.trim().toLowerCase();

    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const password = await bcrypt.hash(input.password, 12);
    let user: PublicUser;
    try {
      user = await this.usersService.create({
        name: input.name.trim(),
        email,
        password,
        role: UserRole.USER,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    return this.createAuthResponse(user);
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    validateBcryptPasswordLength(input.password);
    const user = await this.usersService.findByEmailForAuthentication(
      input.email.trim().toLowerCase(),
    );

    if (!user || !(await bcrypt.compare(input.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.syncIdentity(user);
    const publicUser: PublicUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    return this.createAuthResponse(publicUser);
  }

  private async createAuthResponse(user: PublicUser): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    };
  }
}
