import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js';
import { RequestSummaryDto } from './dto/request-summary.dto.js';
import { DocumentsService, MAX_DOCUMENT_SIZE } from './documents.service.js';
import type {
  DocumentDashboardStats,
  PaginatedDocuments,
  PublicDocument,
} from './document.types.js';
import { DocumentFileType } from './schemas/document.schema.js';
import { SearchDocumentsQueryDto } from './dto/search-documents-query.dto.js';
import { SemanticSearchService } from '../ai/semantic-search.service.js';
import type { SemanticSearchResponse } from '../ai/semantic-search.service.js';

function hasValidFileMetadata(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>,
): boolean {
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  return (
    (extension === '.pdf' && mimeType === 'application/pdf') ||
    (extension === '.txt' && mimeType === 'text/plain')
  );
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly semanticSearchService: SemanticSearchService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1, fields: 0 },
      fileFilter: (_request, file, callback) => {
        if (!hasValidFileMetadata(file)) {
          callback(
            new BadRequestException(
              'Only matching PDF and TXT file extensions and MIME types are accepted',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicDocument> {
    if (!file) {
      throw new BadRequestException('A PDF or TXT file is required');
    }
    return this.documentsService.upload(file, user);
  }

  @Get()
  list(
    @Query() query: ListDocumentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDocuments> {
    return this.documentsService.list(user, query);
  }

  @Get('stats')
  dashboardStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentDashboardStats> {
    return this.documentsService.getDashboardStats(user);
  }

  @Get('search')
  @ApiQuery({
    name: 'q',
    required: true,
    schema: { type: 'string', minLength: 2, maxLength: 2000 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
  })
  @ApiQuery({
    name: 'documentId',
    required: false,
    description: 'Restrict results to one accessible document',
  })
  @ApiQuery({
    name: 'fileType',
    required: false,
    enum: Object.values(DocumentFileType),
  })
  search(
    @Query() query: SearchDocumentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SemanticSearchResponse> {
    return this.semanticSearchService.search(query.q, user, query.limit, {
      documentId: query.documentId,
      fileType: query.fileType,
    });
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicDocument> {
    return this.documentsService.getById(id, user);
  }

  @Post(':id/summaries')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: RequestSummaryDto })
  requestSummary(
    @Param('id') id: string,
    @Body() request: RequestSummaryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicDocument> {
    return this.documentsService.requestSummary(id, user, request.type);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.documentsService.remove(id, user);
  }
}
