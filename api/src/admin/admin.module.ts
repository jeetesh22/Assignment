import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import {
  DocumentRecord,
  DocumentSchema,
} from '../documents/schemas/document.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DocumentsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: DocumentRecord.name, schema: DocumentSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
