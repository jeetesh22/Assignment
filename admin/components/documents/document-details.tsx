"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, FileText, HardDrive, Trash2 } from "lucide-react";
import { AiSummaryViewer } from "@/components/documents/ai-summary-viewer";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/workspace/confirmation-dialog";
import { ErrorState } from "@/components/workspace/error-state";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { PageHeader } from "@/components/workspace/page-header";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  deleteDocument,
  formatFileSize,
  formatUploadDate,
  getDocument,
  isProcessingDocument,
  isSummaryGenerating,
  requestDocumentSummary,
} from "@/lib/api/documents";
import type { DocumentRecord, SummaryType } from "@/lib/api/documents";

export function DocumentDetails({ id }: { id: string }) {
  const router = useRouter();
  const [documentState, setDocumentState] = useState<{
    id: string;
    data: DocumentRecord;
  } | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error?: string;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${id}:${reloadKey}`;
  const documentData = documentState?.id === id ? documentState.data : null;

  useEffect(() => {
    const controller = new AbortController();

    getDocument(id, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setDocumentState({ id, data: response });
          setRequestState({ key: requestKey });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: requestKey,
            error: getApiErrorMessage(
              reason,
              "The document details could not be loaded.",
            ),
          });
        }
      });

    return () => controller.abort();
  }, [id, reloadKey, requestKey]);

  const isCurrentRequest = requestState?.key === requestKey;
  const loading = !documentData && !isCurrentRequest;
  const error =
    isCurrentRequest && requestState?.error ? requestState.error : "";
  const document = documentData;

  useEffect(() => {
    if (
      !isCurrentRequest ||
      !document ||
      (!isProcessingDocument(document.status) &&
        !isSummaryGenerating(document.summaryGenerationStatus))
    ) {
      return;
    }
    const timer = setTimeout(() => setReloadKey((key) => key + 1), 3000);
    return () => clearTimeout(timer);
  }, [document, isCurrentRequest, reloadKey]);

  async function removeDocument() {
    await deleteDocument(id);
    router.push("/dashboard/documents");
    router.refresh();
  }

  async function generateSummary(type: SummaryType) {
    const updated = await requestDocumentSummary(id, type);
    setDocumentState({ id, data: updated });
    setReloadKey((key) => key + 1);
  }

  const backLink = (
    <Link
      href="/dashboard/documents"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      <ArrowLeft className="size-4" />
      Back to library
    </Link>
  );

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Document"
          title="Loading document"
          description="Retrieving document details and AI insights."
          action={backLink}
        />
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (!document) {
    return (
      <div>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Document status could not be refreshed. {error}
          </p>
        )}
        <PageHeader
          eyebrow="Document"
          title="Document details"
          description="We couldn’t retrieve this document."
          action={backLink}
        />
        <ErrorState
          description={error || "The requested document was not found."}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Document"
        title={document.title}
        description={document.originalName}
        action={
          <>
            {backLink}
            <ConfirmationDialog
              trigger={
                <Button variant="danger">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              }
              title="Delete document?"
              description={`“${document.title}” will be permanently deleted.`}
              confirmLabel="Delete document"
              destructive
              onConfirm={removeDocument}
            />
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={document.status} />
        <span className="text-sm text-muted">
          Uploaded {formatUploadDate(document.createdAt)}
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-primary">
                <FileText className="size-4" />
              </span>
              <h3 className="text-sm font-semibold text-foreground">
                Document information
              </h3>
            </div>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted">Original file</dt>
                <dd className="mt-1.5 break-all text-sm font-medium text-slate-700">
                  {document.originalName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">File type</dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-700">
                  {document.fileType}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <HardDrive className="size-3.5" />
                  File size
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-700">
                  {formatFileSize(document.fileSize)}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <CalendarDays className="size-3.5" />
                  Uploaded
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-700">
                  {formatUploadDate(document.createdAt)}
                </dd>
              </div>
            </dl>
          </Card>
          <AiSummaryViewer
            summary={document.summary}
            summaries={document.summaries}
            documentStatus={document.status}
            processingError={document.processingError}
            generationStatus={document.summaryGenerationStatus}
            generationType={document.summaryGenerationType}
            generationError={document.summaryGenerationError}
            canGenerate={
              Boolean(document.extractedText.trim()) &&
              (document.status === "COMPLETED" ||
                document.status === "FAILED")
            }
            onGenerate={generateSummary}
          />
        </div>
        <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-violet-50 text-primary">
            <FileText className="size-5" />
          </span>
          <h3 className="text-base font-semibold text-foreground">
            Document processing
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
            {document.status === "COMPLETED"
              ? "Text extraction, embedding generation, and AI summarization are complete."
              : document.status === "FAILED"
                ? document.processingError ||
                  "Processing failed. The document is still available in your library."
                : document.status === "EXTRACTING"
                  ? "Text is being extracted and normalized."
                  : document.status === "GENERATING_EMBEDDINGS"
                    ? "Searchable vector embeddings are being generated."
                    : document.status === "SUMMARIZING"
                      ? "The AI summary is being generated."
                      : document.status === "UPLOADED"
                        ? "The document is queued and waiting for processing."
                        : "Document processing is starting."}
          </p>
        </Card>
      </div>
    </div>
  );
}
