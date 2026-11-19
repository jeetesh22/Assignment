import { z } from "zod";
import { documentListItemSchema } from "@/lib/api/documents";
import { apiClient } from "@/lib/api/client";
import { publicUserSchema } from "@/lib/auth/types";

export type AdminPage<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
};

function normalizePage<T>(
  items: T[],
  page: number,
  limit?: number,
  total?: number,
  pages?: number,
): AdminPage<T> {
  const resolvedLimit = limit ?? Math.max(items.length, 1);
  const resolvedTotal = total ?? items.length;
  return {
    items,
    page,
    limit: resolvedLimit,
    total: resolvedTotal,
    pages: pages ?? (resolvedTotal === 0 ? 0 : 1),
  };
}

export const adminDocumentsSchema = z.union([
  z.array(documentListItemSchema).transform((items) =>
    normalizePage(items, 1),
  ),
  z
    .object({
      items: z.array(documentListItemSchema),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().optional(),
      total: z.number().int().nonnegative().optional(),
      pages: z.number().int().nonnegative().optional(),
    })
    .transform(({ items, page, limit, total, pages }) =>
      normalizePage(items, page, limit, total, pages),
    ),
]);

const adminUserSchema = publicUserSchema.extend({
  createdAt: z.string().datetime().optional(),
});

export const adminUsersSchema = z.union([
  z.array(adminUserSchema).transform((items) =>
    normalizePage(items, 1),
  ),
  z
    .object({
      items: z.array(adminUserSchema),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().optional(),
      total: z.number().int().nonnegative().optional(),
      pages: z.number().int().nonnegative().optional(),
    })
    .transform(({ items, page, limit, total, pages }) =>
      normalizePage(items, page, limit, total, pages),
    ),
]);

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const adminStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  totalDocuments: z.number().int().nonnegative(),
  completedDocuments: z.number().int().nonnegative(),
  failedDocuments: z.number().int().nonnegative(),
});

export type AdminDocument = z.infer<typeof documentListItemSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminStats = z.infer<typeof adminStatsSchema>;

export async function listAdminDocuments(
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<AdminPage<AdminDocument>> {
  const response = await apiClient.get("/admin/documents", {
    params: { page, limit },
    signal,
  });
  return adminDocumentsSchema.parse(response.data);
}

export async function listAdminUsers(
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<AdminPage<AdminUser>> {
  const response = await apiClient.get("/admin/users", {
    params: { page, limit },
    signal,
  });
  return adminUsersSchema.parse(response.data);
}

export async function getAdminStats(
  signal?: AbortSignal,
): Promise<AdminStats> {
  const response = await apiClient.get("/admin/stats", { signal });
  return adminStatsSchema.parse(response.data);
}

export async function deleteAdminDocument(id: string): Promise<void> {
  await apiClient.delete(`/admin/documents/${encodeURIComponent(id)}`);
}

export async function refreshAdminDocumentSummary(id: string): Promise<void> {
  await apiClient.post(
    `/admin/refresh-summary/${encodeURIComponent(id)}`,
  );
}
