import { IsEnum } from 'class-validator';
import { SummaryType } from '../summary.types.js';

export class RequestSummaryDto {
  @IsEnum(SummaryType)
  type!: SummaryType;
}
