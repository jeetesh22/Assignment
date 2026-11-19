import { Module } from '@nestjs/common';
import { DocumentStorageService } from './document-storage.service.js';
import { DocumentTextExtractor } from './document-text-extractor.service.js';

@Module({
  providers: [DocumentStorageService, DocumentTextExtractor],
  exports: [DocumentStorageService, DocumentTextExtractor],
})
export class DocumentFilesModule {}
