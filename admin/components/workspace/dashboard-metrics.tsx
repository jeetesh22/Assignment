"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Files, Search, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/workspace/metric-card";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getDashboardStats } from "@/lib/api/documents";
import type { DashboardStats } from "@/lib/api/documents";

export function DashboardMetrics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getDashboardStats(controller.signal)
      .then(setStats)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            getApiErrorMessage(
              reason,
              "Dashboard counts could not be loaded.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const value = (count: number | undefined) =>
    count ?? (loading ? "…" : "—");

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Dashboard counts could not be loaded. {error}
        </p>
      )}
      <section
        aria-label="Workspace metrics"
        aria-busy={loading}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Documents"
          value={value(stats?.totalDocuments)}
          description="Total documents in your workspace."
          icon={Files}
        />
        <MetricCard
          label="Summaries ready"
          value={value(stats?.summariesReady)}
          description="Documents with a completed AI summary."
          icon={Sparkles}
        />
        <MetricCard
          label="Completed"
          value={value(stats?.completedDocuments)}
          description="Documents fully processed and searchable."
          icon={FileCheck2}
        />
        <MetricCard
          label="Searches"
          value={value(stats?.searches)}
          description="Successful semantic searches by you."
          icon={Search}
        />
      </section>
    </>
  );
}
