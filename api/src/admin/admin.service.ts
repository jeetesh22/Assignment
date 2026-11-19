import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { DocumentsService } from '../documents/documents.service.js';
import { ListDocumentsQueryDto } from '../documents/dto/list-documents-query.dto.js';
import type { PaginatedDocuments } from '../documents/document.types.js';
import {
  DocumentRecord,
  DocumentStatus,
} from '../documents/schemas/document.schema.js';
import { SummaryType } from '../documents/summary.types.js';
import { User, UserRole } from '../users/schemas/user.schema.js';

export interface AdminStatistics {
  totalUsers: number;
  totalDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedAdminUsers {
  items: AdminUserRecord[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(DocumentRecord.name)
    private readonly documentModel: Model<DocumentRecord>,
    private readonly documentsService: DocumentsService,
  ) {}

  async listUsers(query: ListDocumentsQueryDto): Promise<PaginatedAdminUsers> {
    const skip = (query.page - 1) * query.limit;
    const [users, total] = await Promise.all([
      this.userModel
        .find()
        .select('name email role createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.userModel.countDocuments().exec(),
    ]);

    return {
      items: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }

  listDocuments(
    admin: AuthenticatedUser,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocuments> {
    return this.documentsService.list(admin, query);
  }

  refreshSummary(id: string, admin: AuthenticatedUser) {
    return this.documentsService.requestSummary(id, admin, SummaryType.SHORT);
  }

  async getStatistics(): Promise<AdminStatistics> {
    const [
      totalUsers,
      totalDocuments,
      completedDocuments,
      failedDocuments,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.documentModel.countDocuments().exec(),
      this.documentModel
        .countDocuments({ status: DocumentStatus.COMPLETED })
        .exec(),
      this.documentModel
        .countDocuments({ status: DocumentStatus.FAILED })
        .exec(),
    ]);
    return {
      totalUsers,
      totalDocuments,
      completedDocuments,
      failedDocuments,
    };
  }
}
