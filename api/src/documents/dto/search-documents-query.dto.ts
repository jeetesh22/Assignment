import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DocumentFileType } from '../schemas/document.schema.js';

export class SearchDocumentsQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  q!: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @ApiPropertyOptional({
    description: 'Restrict results to one accessible document',
  })
  @IsOptional()
  @IsMongoId()
  documentId?: string;

  @ApiPropertyOptional({ enum: ['PDF', 'TXT'] })
  @IsOptional()
  @IsEnum(DocumentFileType)
  fileType?: DocumentFileType;
}
