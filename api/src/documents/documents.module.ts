import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DocumentRecord, DocumentSchema } from './schemas/document.schema.js';
import { DocumentFilesModule } from './document-files.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [
    AiModule,
    AuthModule,
    UsersModule,
    DocumentFilesModule,
    MongooseModule.forFeature([
      { name: DocumentRecord.name, schema: DocumentSchema },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
