"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "@/components/documents/document-table";
import type { DocumentRow } from "@/components/documents/document-table";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { PageHeader } from "@/components/workspace/page-header";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  deleteAdminDocument,
  listAdminDocuments,
  refreshAdminDocumentSummary,
} from "@/lib/api/admin";
import type { AdminPage, AdminDocument } from "@/lib/api/admin";

const PAGE_SIZE = 10;

export function AdminDocuments() {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<AdminPage<AdminDocument> | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const requestKey = `${page}:${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    listAdminDocuments(page, PAGE_SIZE, controller.signal)
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
            error: getApiErrorMessage(
              reason,
              "Platform documents could not be loaded.",
            ),
          });
        }
      });

    return () => controller.abort();
  }, [page, reloadKey, requestKey]);

  async function removeDocument(document: DocumentRow) {
    await deleteAdminDocument(document.id);
    setNotice(`${document.title} was deleted.`);
    if (data && data.items.length === 1 && page > 1) {
      setPage((current) => current - 1);
    }
    setReloadKey((key) => key + 1);
  }

  async function regenerateSummary(document: DocumentRow) {
    await refreshAdminDocumentSummary(document.id);
    setNotice(`Summary regeneration was requested for ${document.title}.`);
    setReloadKey((key) => key + 1);
  }

  const currentRequest = requestState?.key === requestKey;
  const loading = !currentRequest;
  const error =
    currentRequest && requestState?.error ? requestState.error : "";
  const currentData = currentRequest && !error ? data : null;
  const rows: DocumentRow[] =
    currentData?.items.map(
      ({ id, title, originalName, fileType, status, createdAt }) => ({
        id,
        title,
        originalName,
        fileType,
        status,
        createdAt,
      }),
    ) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="All documents"
        description="Review, process, and manage documents across the platform."
      />
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState
          description={error}
          onRetry={() => {
            setNotice("");
            setReloadKey((key) => key + 1);
          }}
        />
      ) : currentData ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted">
              {currentData.total}{" "}
              {currentData.total === 1 ? "document" : "documents"}
            </p>
            <p className="hidden text-xs text-muted sm:block">
              Regenerate summaries or delete platform documents.
            </p>
          </div>
          <DocumentTable
            documents={rows}
            emptyTitle="No platform documents"
            emptyDescription="The admin API returned no documents."
            onDelete={removeDocument}
            onRegenerateSummary={regenerateSummary}
          />
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
      ) : null}
    </div>
  );
}
