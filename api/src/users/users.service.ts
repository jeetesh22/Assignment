import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User } from './schemas/user.schema.js';
import type { UserDocument } from './schemas/user.schema.js';
import type { CreateUserInput, PublicUser } from './user.types.js';
import { PostgresVectorStore } from '../ai/postgres-vector-store.service.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly postgres: PostgresVectorStore,
  ) {}

  async create(input: CreateUserInput): Promise<PublicUser> {
    const user = await this.userModel.create(input);
    try {
      await this.syncIdentity(user);
    } catch (error) {
      try {
        await user.deleteOne();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'PostgreSQL identity sync and MongoDB user cleanup both failed',
        );
      }
      throw error;
    }
    return this.toPublicUser(user);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findByEmailForAuthentication(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;
    await this.syncIdentity(user);
    return this.toPublicUser(user);
  }

  async incrementSearchCount(id: string): Promise<void> {
    const result = await this.userModel
      .updateOne(
        { _id: id },
        { $inc: { searchCount: 1 } },
        { timestamps: false },
      )
      .exec();
    if (result.matchedCount !== 1) {
      throw new NotFoundException('User not found');
    }
  }

  async getSearchCount(id: string): Promise<number> {
    const user = await this.userModel
      .findById(id)
      .select('searchCount')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.searchCount ?? 0;
  }

  async syncIdentity(user: UserDocument): Promise<void> {
    await this.postgres.syncUser({
      externalId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  private toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
