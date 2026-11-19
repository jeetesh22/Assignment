import { z } from "zod";
import { apiClient } from "@/lib/api/client";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Enter at least 2 characters.").max(2000),
  limit: z.number().int().positive().max(50).default(10),
  documentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  fileType: z.enum(["PDF", "TXT"]).optional(),
});

export const searchResultSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  score: z.number().min(-1).max(1),
});

const searchResultsSchema = z.array(searchResultSchema);
const searchPayloadSchema = z.union([
  searchResultsSchema,
  z.object({ results: searchResultsSchema }),
]);

export const searchResponseSchema = searchPayloadSchema.transform((payload) =>
  Array.isArray(payload) ? { results: payload } : payload,
);

export type SearchResult = z.infer<typeof searchResultSchema>;

export type SearchFilters = {
  documentId?: string;
  fileType?: "PDF" | "TXT";
};

export async function searchDocuments(
  q: string,
  filters: SearchFilters = {},
  signal?: AbortSignal,
) {
  const { q: query, ...params } = searchQuerySchema.parse({ q, ...filters });
  const response = await apiClient.get("/documents/search", {
    params: { q: query, ...params },
    signal,
    timeout: 30_000,
  });
  return searchResponseSchema.parse(response.data);
}
