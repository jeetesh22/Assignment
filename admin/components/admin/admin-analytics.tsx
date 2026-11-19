"use client";

import { useEffect, useState } from "react";
import { Activity, CircleAlert, Files, Users } from "lucide-react";
import { MetricCard } from "@/components/workspace/metric-card";
import { PageHeader } from "@/components/workspace/page-header";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { EmptyState } from "@/components/workspace/empty-state";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getAdminStats } from "@/lib/api/admin";
import type { AdminStats } from "@/lib/api/admin";

const numberFormat = new Intl.NumberFormat();

export function AdminAnalytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [requestState, setRequestState] = useState<{
    key: number;
    error?: string;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAdminStats(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setStats(response);
          setRequestState({ key: reloadKey });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: reloadKey,
            error: getApiErrorMessage(
              reason,
              "System statistics could not be loaded.",
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
  const currentStats = currentRequest && !error ? stats : null;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="System statistics"
        description="Live account and document processing totals from the admin API."
      />
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          description={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : currentStats ? (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total users"
              value={numberFormat.format(currentStats.totalUsers)}
              description="Registered platform accounts"
              icon={Users}
            />
            <MetricCard
              label="Total documents"
              value={numberFormat.format(currentStats.totalDocuments)}
              description="Documents across all users"
              icon={Files}
            />
            <MetricCard
              label="Completed documents"
              value={numberFormat.format(currentStats.completedDocuments)}
              description="Successfully processed"
              icon={Activity}
            />
            <MetricCard
              label="Failed documents"
              value={numberFormat.format(currentStats.failedDocuments)}
              description="Processing failures"
              icon={CircleAlert}
            />
          </div>
          <section aria-labelledby="audit-log-heading">
            <h3
              id="audit-log-heading"
              className="mb-4 text-base font-semibold text-foreground"
            >
              Audit logs
            </h3>
            <EmptyState
              icon={Activity}
              title="Audit log data is unavailable"
              description="The provided API list does not include an audit-log endpoint or log records. No events are fabricated."
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
