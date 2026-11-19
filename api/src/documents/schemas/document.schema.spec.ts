import mongoose, { Types } from 'mongoose';
import {
  DocumentFileType,
  DocumentSchema,
  DocumentStatus,
} from './document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from '../summary.types.js';

describe('DocumentRecord schema', () => {
  it('allows empty extracted text and summary before AI processing', async () => {
    const model = mongoose.model(
      'DocumentRecordUploadValidationTest',
      DocumentSchema,
    );
    const document = new model({
      title: 'sql_joins',
      originalName: 'sql_joins.pdf',
      fileType: DocumentFileType.PDF,
      fileSize: 1024,
      owner: new Types.ObjectId(),
      contentHash: 'a'.repeat(64),
      status: DocumentStatus.UPLOADED,
      storageKey: 'private-storage-key',
    });

    expect(document.extractedText).toBe('');
    expect(document.summary).toBe('');
    expect([...document.summaries]).toEqual([]);
    expect(document.summaryGenerationStatus).toBe(
      SummaryGenerationStatus.IDLE,
    );
    expect(document.summaryGenerationType).toBe(SummaryType.SHORT);
    expect(document.embeddingReferences).toEqual([]);
    expect(document.toJSON()).not.toHaveProperty('contentHash');
    expect(document.toJSON()).not.toHaveProperty('embeddingReferences');
    await expect(document.validate()).resolves.toBeUndefined();
  });
});
