import {
  DocumentFileType,
  DocumentStatus,
} from './schemas/document.schema.js';
import {
  SummaryGenerationStatus,
  SummaryType,
} from './summary.types.js';

export interface PublicDocument {
  id: string;
  title: string;
  originalName: string;
  fileType: DocumentFileType;
  fileSize: number;
  summary: string;
  summaries: Partial<Record<SummaryType, string>>;
  summaryGenerationStatus: SummaryGenerationStatus;
  summaryGenerationType: SummaryType;
  summaryGenerationError?: string;
  owner: string;
  status: DocumentStatus;
  processingError?: string;
  createdAt: Date;
  updatedAt: Date;
  extractedText?: string;
}

export interface PaginatedDocuments {
  items: PublicDocument[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DocumentDashboardStats {
  totalDocuments: number;
  summariesReady: number;
  completedDocuments: number;
  searches: number;
}
