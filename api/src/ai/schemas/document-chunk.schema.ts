import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { DocumentRecord } from '../../documents/schemas/document.schema.js';
import { User } from '../../users/schemas/user.schema.js';

@Schema({ timestamps: true })
export class DocumentChunk {
  @Prop({
    type: Types.ObjectId,
    ref: DocumentRecord.name,
    required: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  chunkIndex!: number;

  @Prop({ required: true, select: false })
  content!: string;

  @Prop({ type: [Number], required: true, select: false })
  embedding!: number[];

  @Prop({ required: true })
  embeddingModel!: string;

  @Prop({ required: true, min: 0 })
  startChar!: number;

  @Prop({ required: true, min: 0 })
  endChar!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentChunkSchema =
  SchemaFactory.createForClass(DocumentChunk);
DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
DocumentChunkSchema.index({ owner: 1, documentId: 1 });
