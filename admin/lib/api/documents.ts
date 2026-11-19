import { z } from "zod";
import { apiClient } from "@/lib/api/client";

export const documentStatusSchema = z.enum([
  "UPLOADED",
  "PROCESSING",
  "EXTRACTING",
  "GENERATING_EMBEDDINGS",
  "SUMMARIZING",
  "COMPLETED",
  "FAILED",
]);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const summaryTypeSchema = z.enum([
  "SHORT",
  "DETAILED",
  "BULLET_POINTS",
  "EXECUTIVE",
  "KEY_INSIGHTS",
  "KEYWORDS",
]);
export type SummaryType = z.infer<typeof summaryTypeSchema>;

export const summaryGenerationStatusSchema = z.enum([
  "IDLE",
  "QUEUED",
  "GENERATING",
  "COMPLETED",
  "FAILED",
]);
export type SummaryGenerationStatus = z.infer<
  typeof summaryGenerationStatusSchema
>;

const summaryVariantsSchema = z
  .object({
    SHORT: z.string().optional(),
    DETAILED: z.string().optional(),
    BULLET_POINTS: z.string().optional(),
    EXECUTIVE: z.string().optional(),
    KEY_INSIGHTS: z.string().optional(),
    KEYWORDS: z.string().optional(),
  })
  .default({});

export function isProcessingDocument(status: DocumentStatus): boolean {
  return status !== "COMPLETED" && status !== "FAILED";
}

export function isSummaryGenerating(
  status: SummaryGenerationStatus,
): boolean {
  return status === "QUEUED" || status === "GENERATING";
}

export const documentListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  originalName: z.string(),
  fileType: z.enum(["PDF", "TXT"]),
  fileSize: z.number().nonnegative(),
  summary: z.string().nullable().optional().transform((value) => value ?? ""),
  summaries: summaryVariantsSchema,
  summaryGenerationStatus: summaryGenerationStatusSchema.default("IDLE"),
  summaryGenerationType: summaryTypeSchema.default("SHORT"),
  summaryGenerationError: z.string().nullable().optional().transform((value) => value ?? ""),
  processingError: z.string().nullable().optional().transform((value) => value ?? ""),
  status: documentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const documentSchema = documentListItemSchema.extend({
  extractedText: z.string().nullable().optional().transform((value) => value ?? ""),
});

export type DocumentListItem = z.infer<typeof documentListItemSchema>;
export type DocumentRecord = z.infer<typeof documentSchema>;

export const summaryRequestSchema = z.object({
  type: summaryTypeSchema,
});

export const paginatedDocumentsSchema = z.object({
  items: z.array(documentListItemSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
});

export type PaginatedDocuments = z.infer<typeof paginatedDocumentsSchema>;

export const dashboardStatsSchema = z.object({
  totalDocuments: z.number().int().nonnegative(),
  summariesReady: z.number().int().nonnegative(),
  completedDocuments: z.number().int().nonnegative(),
  searches: z.number().int().nonnegative(),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export async function listDocuments(
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<PaginatedDocuments> {
  const response = await apiClient.get("/documents", {
    params: { page, limit },
    signal,
  });
  return paginatedDocumentsSchema.parse(response.data);
}

export async function getDashboardStats(
  signal?: AbortSignal,
): Promise<DashboardStats> {
  const response = await apiClient.get("/documents/stats", { signal });
  return dashboardStatsSchema.parse(response.data);
}

export async function uploadDocument(
  file: File,
  onProgress: (percent: number) => void,
): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/documents/upload", formData, {
    timeout: 70_000,
    onUploadProgress: ({ loaded, total }) => {
      if (total && total > 0) {
        onProgress(Math.min(100, Math.round((loaded / total) * 100)));
      }
    },
  });
  return documentSchema.parse(response.data);
}

export async function getDocument(
  id: string,
  signal?: AbortSignal,
): Promise<DocumentRecord> {
  const response = await apiClient.get(
    `/documents/${encodeURIComponent(id)}`,
    { signal },
  );
  return documentSchema.parse(response.data);
}

export async function requestDocumentSummary(
  id: string,
  type: SummaryType,
): Promise<DocumentRecord> {
  const response = await apiClient.post(
    `/documents/${encodeURIComponent(id)}/summaries`,
    { type },
  );
  return documentSchema.parse(response.data);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${encodeURIComponent(id)}`);
}

export function formatUploadDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
