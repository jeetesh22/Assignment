import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from '../summary.types.js';

export enum DocumentFileType {
  PDF = 'PDF',
  TXT = 'TXT',
}

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  EXTRACTING = 'EXTRACTING',
  GENERATING_EMBEDDINGS = 'GENERATING_EMBEDDINGS',
  SUMMARIZING = 'SUMMARIZING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_document, value: Record<string, unknown>) => {
      delete value.storageKey;
      delete value.contentHash;
      delete value.embeddingReferences;
      delete value.__v;
      return value;
    },
  },
})
export class DocumentRecord {
  @Prop({ required: true, trim: true, maxlength: 255 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 255 })
  originalName!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(DocumentFileType),
  })
  fileType!: DocumentFileType;

  @Prop({ required: true, min: 1, max: 5 * 1024 * 1024 })
  fileSize!: number;

  @Prop({ type: String, default: '' })
  extractedText!: string;

  @Prop({ type: String, default: '' })
  summary!: string;

  @Prop({ type: Map, of: String, default: () => ({}) })
  summaries!: Map<SummaryType, string>;

  @Prop({
    type: String,
    enum: Object.values(SummaryGenerationStatus),
    default: SummaryGenerationStatus.IDLE,
  })
  summaryGenerationStatus!: SummaryGenerationStatus;

  @Prop({
    type: String,
    enum: Object.values(SummaryType),
    default: SummaryType.SHORT,
  })
  summaryGenerationType!: SummaryType;

  @Prop({ type: String, default: '', maxlength: 500 })
  summaryGenerationError!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner!: Types.ObjectId;

  @Prop({ required: true, select: false })
  contentHash!: string;

  @Prop({ type: [String], default: [], select: false })
  embeddingReferences!: string[];

  @Prop({ type: String, default: '', maxlength: 500 })
  processingError!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(DocumentStatus),
    default: DocumentStatus.UPLOADED,
  })
  status!: DocumentStatus;

  @Prop({ required: true, select: false })
  storageKey!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentRecord);
DocumentSchema.index({ owner: 1, createdAt: -1 });
DocumentSchema.index(
  { owner: 1, contentHash: 1 },
  {
    unique: true,
    partialFilterExpression: { contentHash: { $type: 'string' } },
  },
);
DocumentSchema.index({ status: 1, updatedAt: 1 });
