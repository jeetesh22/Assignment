import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ListDocumentsQueryDto } from '../documents/dto/list-documents-query.dto.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { AdminService } from './admin.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('access')
  @Roles(UserRole.ADMIN)
  getAccess(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, role: user.role };
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  getStatistics() {
    return this.adminService.getStatistics();
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  listUsers(@Query() query: ListDocumentsQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('documents')
  @Roles(UserRole.ADMIN)
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.adminService.listDocuments(user, query);
  }

  @Post('refresh-summary/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN)
  refreshSummary(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminService.refreshSummary(id, user);
  }
}
