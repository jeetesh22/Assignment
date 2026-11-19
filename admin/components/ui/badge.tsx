import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const statusStyles = {
  UPLOADED: "border-slate-200 bg-slate-100 text-slate-600",
  PROCESSING: "border-amber-200 bg-amber-50 text-amber-700",
  EXTRACTING: "border-sky-200 bg-sky-50 text-sky-700",
  GENERATING_EMBEDDINGS: "border-violet-200 bg-violet-50 text-violet-700",
  SUMMARIZING: "border-indigo-200 bg-indigo-50 text-indigo-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

export type DocumentStatus = keyof typeof statusStyles;

const statusLabels: Record<DocumentStatus, string> = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  EXTRACTING: "Extracting",
  GENERATING_EMBEDDINGS: "Generating embeddings",
  SUMMARIZING: "Summarizing",
  COMPLETED: "Completed",
  FAILED: "Processing failed",
};

export function StatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        statusStyles[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-600",
        className,
      )}
      {...props}
    />
  );
}
