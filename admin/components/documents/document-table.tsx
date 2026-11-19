import Link from "next/link";
import { ArrowUpRight, FileText, Sparkles, Trash2 } from "lucide-react";
import type { DocumentStatus } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/workspace/empty-state";
import { ConfirmationDialog } from "@/components/workspace/confirmation-dialog";
import { formatUploadDate } from "@/lib/api/documents";

export interface DocumentRow {
  id: string;
  title: string;
  originalName: string;
  fileType: "PDF" | "TXT";
  status: DocumentStatus;
  createdAt: string;
}

export function DocumentTable({
  documents,
  emptyTitle = "No documents yet",
  emptyDescription = "Documents added to this workspace will appear here.",
  onDelete,
  onRegenerateSummary,
}: {
  documents: DocumentRow[];
  emptyTitle?: string;
  emptyDescription?: string;
  onDelete?: (document: DocumentRow) => void | Promise<void>;
  onRegenerateSummary?: (document: DocumentRow) => void | Promise<void>;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_28px_rgba(27,39,73,0.035)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-slate-50/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <th className="px-6 py-4">Document</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Uploaded</th>
              <th className="px-6 py-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr
                key={document.id}
                className="border-b border-border/70 last:border-0 hover:bg-slate-50/60"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/documents/${document.id}`}
                    className="group flex items-center gap-3"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-primary">
                      <FileText className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-primary">
                        {document.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-400">
                        {document.originalName}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {document.fileType}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={document.status} />
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {formatUploadDate(document.createdAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      href={`/dashboard/documents/${document.id}`}
                      aria-label={`Open ${document.title}`}
                      className="inline-grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-primary"
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                    {onRegenerateSummary && (
                      <ConfirmationDialog
                        trigger={
                          <button
                            type="button"
                            aria-label={`Regenerate AI summary for ${document.title}`}
                            className="inline-grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-violet-50 hover:text-primary"
                          >
                            <Sparkles className="size-4" />
                          </button>
                        }
                        title="Regenerate AI summary?"
                        description={`A new AI summary will be generated for “${document.title}”.`}
                        confirmLabel="Regenerate summary"
                        onConfirm={() => onRegenerateSummary(document)}
                      />
                    )}
                    {onDelete && (
                      <ConfirmationDialog
                        trigger={
                          <button
                            type="button"
                            aria-label={`Delete ${document.title}`}
                            className="inline-grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        }
                        title="Delete document?"
                        description={`“${document.title}” will be permanently deleted.`}
                        confirmLabel="Delete document"
                        destructive
                        onConfirm={() => onDelete(document)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
