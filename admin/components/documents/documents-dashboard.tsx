"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "@/components/documents/document-table";
import type { DocumentRow } from "@/components/documents/document-table";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  deleteDocument,
  isProcessingDocument,
  listDocuments,
} from "@/lib/api/documents";
import type { DocumentRecord, PaginatedDocuments } from "@/lib/api/documents";

const PAGE_SIZE = 10;

export function DocumentsDashboard() {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<PaginatedDocuments | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const requestKey = `${page}:${reloadKey}`;

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    listDocuments(page, PAGE_SIZE, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setResult(response);
          setRequestState({ key: requestKey });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: requestKey,
            error: getApiErrorMessage(
              reason,
              "The document library could not be loaded.",
            ),
          });
        }
      });

    return () => controller.abort();
  }, [page, reloadKey, requestKey]);

  function handleUploaded(documents: DocumentRecord[]) {
    const count = documents.length;
    setNotice(
      `${count} ${count === 1 ? "document was" : "documents were"} uploaded successfully.`,
    );
    setPage(1);
    reload();
  }

  async function handleDelete(document: DocumentRow) {
    await deleteDocument(document.id);
    setNotice(`${document.title} was deleted.`);

    if (result && result.items.length === 1 && page > 1) {
      setPage((current) => current - 1);
      return;
    }

    setResult((current) => {
      if (!current) return current;
      const total = Math.max(0, current.total - 1);
      return {
        ...current,
        items: current.items.filter((item) => item.id !== document.id),
        total,
        pages: Math.ceil(total / current.limit),
      };
    });
  }

  const rows: DocumentRow[] =
    result?.items.map((document) => ({
      id: document.id,
      title: document.title,
      originalName: document.originalName,
      fileType: document.fileType,
      status: document.status,
      createdAt: document.createdAt,
    })) ?? [];
  const isCurrentRequest = requestState?.key === requestKey;
  const hasCurrentPageResult = result?.page === page;
  const loading = !isCurrentRequest && !hasCurrentPageResult;
  const error =
    isCurrentRequest && requestState?.error ? requestState.error : "";
  const visibleResult = hasCurrentPageResult ? result : null;

  useEffect(() => {
    if (
      !isCurrentRequest ||
      !result?.items.some((document) => isProcessingDocument(document.status))
    ) {
      return;
    }
    const timer = setTimeout(reload, 3000);
    return () => clearTimeout(timer);
  }, [isCurrentRequest, result, reload, reloadKey]);

  return (
    <div>
      <div className="mb-7 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Library
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[30px]">
            Documents
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Manage your files and follow their AI processing status.
          </p>
        </div>
        <UploadDialog onUploaded={handleUploaded} />
      </div>

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
      ) : error && !visibleResult ? (
        <ErrorState
          description={error}
          onRetry={() => {
            setNotice("");
            reload();
          }}
        />
      ) : visibleResult ? (
        <>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              Document status could not be refreshed. {error}
            </p>
          )}
          <DocumentTable
            documents={rows}
            emptyTitle="No documents yet"
            emptyDescription="Upload a PDF or TXT file to start building your document library."
            onDelete={handleDelete}
          />
          {visibleResult.pages > 1 && (
            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="text-sm text-muted">
                Page {visibleResult.page} of {visibleResult.pages}
                <span className="ml-2 hidden sm:inline">
                  · {visibleResult.total} documents
                </span>
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
                  disabled={page >= visibleResult.pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          {visibleResult.pages <= 1 && visibleResult.total > 0 && (
            <p className="mt-4 text-sm text-muted">
              {visibleResult.total} {visibleResult.total === 1 ? "document" : "documents"}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
