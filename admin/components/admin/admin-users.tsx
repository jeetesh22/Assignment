"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/empty-state";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { PageHeader } from "@/components/workspace/page-header";
import { Users } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import { listAdminUsers } from "@/lib/api/admin";
import type { AdminPage, AdminUser } from "@/lib/api/admin";
import { formatUploadDate } from "@/lib/api/documents";

const PAGE_SIZE = 10;

export function AdminUsers() {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<AdminPage<AdminUser> | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error?: string;
  } | null>(null);
  const requestKey = `${page}:${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    listAdminUsers(page, PAGE_SIZE, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setData(response);
          setRequestState({ key: requestKey });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: requestKey,
            error: getApiErrorMessage(reason, "User accounts could not be loaded."),
          });
        }
      });

    return () => controller.abort();
  }, [page, reloadKey, requestKey]);

  const currentRequest = requestState?.key === requestKey;
  const loading = !currentRequest;
  const error =
    currentRequest && requestState?.error ? requestState.error : "";
  const currentData = currentRequest && !error ? data : null;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Review registered accounts and their platform roles."
      />
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState
          description={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : currentData && currentData.items.length > 0 ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              {currentData.total} {currentData.total === 1 ? "user" : "users"}
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_28px_rgba(27,39,73,0.035)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-slate-50/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.items.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border/70 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          className={
                            user.role === "ADMIN"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : ""
                          }
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {user.createdAt
                          ? formatUploadDate(user.createdAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {currentData.pages > 1 && (
            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="text-sm text-muted">
                Page {currentData.page} of {currentData.pages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= currentData.pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Users}
          title="No user accounts"
          description="The admin API returned no user records."
        />
      )}
    </div>
  );
}
