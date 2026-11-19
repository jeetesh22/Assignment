"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleX,
  Files,
  Users,
} from "lucide-react";
import { DocumentTable } from "@/components/documents/document-table";
import type { DocumentRow } from "@/components/documents/document-table";
import { MetricCard } from "@/components/workspace/metric-card";
import { PageHeader } from "@/components/workspace/page-header";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getAdminStats, listAdminDocuments } from "@/lib/api/admin";
import type { AdminStats } from "@/lib/api/admin";

type OverviewData = {
  stats: AdminStats;
  recentUploads: DocumentRow[];
};

const numberFormat = new Intl.NumberFormat();

export function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [requestState, setRequestState] = useState<{
    key: number;
    error?: string;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getAdminStats(controller.signal),
      listAdminDocuments(1, 5, controller.signal),
    ])
      .then(([stats, documents]) => {
        if (controller.signal.aborted) return;
        const recentUploads = [...documents.items]
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
          )
          .slice(0, 5)
          .map(({ id, title, originalName, fileType, status, createdAt }) => ({
            id,
            title,
            originalName,
            fileType,
            status,
            createdAt,
          }));
        setData({ stats, recentUploads });
        setRequestState({ key: reloadKey });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: reloadKey,
            error: getApiErrorMessage(
              reason,
              "Admin statistics could not be loaded.",
            ),
          });
        }
      });

    return () => controller.abort();
  }, [reloadKey]);

  const currentRequest = requestState?.key === reloadKey;
  const loading = !currentRequest;
  const error =
    currentRequest && requestState?.error ? requestState.error : "";
  const overview = currentRequest && !error ? data : null;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="System overview"
        description="Live platform activity and document processing at a glance."
        action={
          <Link
            href="/admin/analytics"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-slate-50"
          >
            System statistics
            <ArrowUpRight className="size-4" />
          </Link>
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          description={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : overview ? (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total users"
              value={numberFormat.format(overview.stats.totalUsers)}
              description="Registered platform accounts"
              icon={Users}
            />
            <MetricCard
              label="Total documents"
              value={numberFormat.format(overview.stats.totalDocuments)}
              description="Documents across all users"
              icon={Files}
            />
            <MetricCard
              label="Completed"
              value={numberFormat.format(overview.stats.completedDocuments)}
              description="Documents fully processed"
              icon={CheckCircle2}
            />
            <MetricCard
              label="Failed"
              value={numberFormat.format(overview.stats.failedDocuments)}
              description="Documents needing attention"
              icon={CircleX}
            />
          </div>

          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Recent uploads
              </h3>
              <p className="mt-1 text-sm text-muted">
                Latest documents returned by the admin documents API.
              </p>
            </div>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80"
            >
              All documents <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <DocumentTable
            documents={overview.recentUploads}
            emptyTitle="No recent uploads"
            emptyDescription="There are no documents in the live admin response."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
            >
              Manage users <ArrowUpRight className="size-4" />
            </Link>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
            >
              Manage documents <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
