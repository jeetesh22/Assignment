"use client";

import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { isAxiosError } from "axios";
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  FileUp,
  Info,
  LoaderCircle,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatFileSize, uploadDocument } from "@/lib/api/documents";
import type { DocumentRecord } from "@/lib/api/documents";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Map([
  [".pdf", "application/pdf"],
  [".txt", "text/plain"],
]);

type UploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "processing"
  | "extracting"
  | "embedding"
  | "summarizing"
  | "completed"
  | "processing-failed"
  | "failed"
  | "duplicate";

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  message?: string;
  retryable?: boolean;
}

const statusStyles: Record<UploadStatus, string> = {
  queued: "bg-slate-100 text-slate-700",
  uploading: "bg-violet-100 text-violet-800",
  uploaded: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-800",
  extracting: "bg-sky-100 text-sky-800",
  embedding: "bg-violet-100 text-violet-800",
  summarizing: "bg-indigo-100 text-indigo-800",
  completed: "bg-emerald-100 text-emerald-800",
  "processing-failed": "bg-rose-100 text-rose-800",
  failed: "bg-rose-100 text-rose-800",
  duplicate: "bg-amber-100 text-amber-800",
};

const statusLabels: Record<UploadStatus, string> = {
  queued: "Ready",
  uploading: "Uploading",
  uploaded: "Uploaded",
  processing: "Processing",
  extracting: "Extracting",
  embedding: "Generating embeddings",
  summarizing: "Summarizing",
  completed: "Complete",
  "processing-failed": "Processing failed",
  failed: "Upload failed",
  duplicate: "Duplicate",
};

function getValidationError(file: File): string | undefined {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (ACCEPTED_TYPES.get(extension) !== file.type) {
    return "Choose a PDF or TXT file with a matching file type.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_SIZE) return "The maximum file size is 5 MB.";
  return undefined;
}

function createQueueItem(file: File): UploadItem {
  const message = getValidationError(file);
  return {
    id: crypto.randomUUID(),
    file,
    status: message ? "failed" : "queued",
    progress: 0,
    message,
  };
}

function isDuplicateResponse(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 409;
}

export function UploadDialog({
  onUploaded,
}: {
  onUploaded?: (documents: DocumentRecord[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [success, setSuccess] = useState("");

  function addFiles(files: FileList | File[]) {
    const additions = Array.from(files, createQueueItem);
    if (additions.length === 0) return;
    setItems((current) => [...current, ...additions]);
    setSuccess("");
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!uploading) addFiles(event.dataTransfer.files);
  }

  async function submit() {
    const pending = items.filter((item) => item.status === "queued");
    if (pending.length === 0) return;

    setUploading(true);
    setSuccess("");
    const uploaded: DocumentRecord[] = [];
    let duplicates = 0;

    try {
      for (const item of pending) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "uploading", progress: 0, message: undefined }
              : entry,
          ),
        );

        try {
          const document = await uploadDocument(item.file, (progress) => {
            setItems((current) =>
              current.map((entry) =>
                entry.id === item.id ? { ...entry, progress } : entry,
              ),
            );
          });
          uploaded.push(document);
          const status: UploadStatus =
            document.status === "COMPLETED"
              ? "completed"
              : document.status === "FAILED"
                ? "processing-failed"
                : document.status === "UPLOADED"
                  ? "uploaded"
                  : document.status === "EXTRACTING"
                    ? "extracting"
                    : document.status === "GENERATING_EMBEDDINGS"
                      ? "embedding"
                      : document.status === "SUMMARIZING"
                        ? "summarizing"
                        : "processing";
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status,
                    progress: 100,
                    message:
                      status === "processing-failed"
                        ? "Uploaded, but document processing failed."
                        : undefined,
                  }
                : entry,
            ),
          );
        } catch (reason) {
          const duplicate = isDuplicateResponse(reason);
          if (duplicate) duplicates += 1;
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: duplicate ? "duplicate" : "failed",
                    message: duplicate
                      ? "A document with identical content already exists."
                      : getApiErrorMessage(
                          reason,
                          "The document could not be uploaded. Try again.",
                        ),
                    retryable: !duplicate,
                  }
                : entry,
            ),
          );
        }
      }

      if (uploaded.length > 0) onUploaded?.(uploaded);
      if (uploaded.length > 0 || duplicates > 0) {
        const uploadedMessage =
          uploaded.length > 0
            ? `${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} uploaded.`
            : "";
        const duplicateMessage =
          duplicates > 0
            ? `${duplicates} duplicate ${duplicates === 1 ? "was" : "were"} skipped.`
            : "";
        setSuccess([uploadedMessage, duplicateMessage].filter(Boolean).join(" "));
      }
      if (uploaded.length === pending.length) changeOpen(false, true);
    } finally {
      setUploading(false);
    }
  }

  function retry(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "queued",
              progress: 0,
              message: undefined,
              retryable: false,
            }
          : item,
      ),
    );
    setSuccess("");
  }

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function changeOpen(nextOpen: boolean, afterUpload = false) {
    if (uploading && !afterUpload) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setItems([]);
      setSuccess("");
      setDragging(false);
    }
  }

  const readyCount = items.filter((item) => item.status === "queued").length;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="size-4" />
          Upload documents
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>
            Add several PDFs or plain text files at once. Each file is securely
            stored and processed separately.
          </DialogDescription>
        </DialogHeader>

        <label
          htmlFor="document-files"
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={dropFiles}
          className={`flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center transition ${
            uploading
              ? "cursor-not-allowed border-slate-200 bg-slate-50"
              : dragging
                ? "cursor-pointer border-primary bg-violet-50"
                : "cursor-pointer border-slate-300 bg-slate-50/70 hover:border-primary/50 hover:bg-violet-50/40"
          }`}
        >
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-white text-primary shadow-sm">
            <UploadCloud className="size-5" />
          </span>
          <span className="text-sm font-semibold text-slate-700">
            Drop files here or choose from your device
          </span>
          <span className="mt-1.5 text-xs text-muted">
            PDF or TXT · Up to 5 MB per file · Multiple files supported
          </span>
          <input
            id="document-files"
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            multiple
            onChange={chooseFiles}
            disabled={uploading}
            className="sr-only"
          />
        </label>

        <div className="flex items-start gap-2.5 rounded-xl bg-violet-50 px-3.5 py-3 text-xs leading-5 text-violet-900">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Files are checked for type, size, and duplicate content before they
            are saved. Uploads run one at a time so each file gets its own
            progress and processing status.
          </p>
        </div>

        {items.length > 0 && (
          <section aria-label="Upload queue">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Upload queue <span className="text-muted">({items.length})</span>
              </h3>
              <p className="text-xs text-muted">
                {readyCount} {readyCount === 1 ? "file" : "files"} ready
              </p>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-border bg-white px-3.5 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="max-w-full truncate text-sm font-medium text-slate-800">
                          {item.file.name}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[item.status]}`}
                        >
                          {item.status === "uploading" && (
                            <LoaderCircle className="mr-1 inline size-3 animate-spin" />
                          )}
                          {item.status === "completed" && (
                            <CheckCircle2 className="mr-1 inline size-3" />
                          )}
                          {(item.status === "failed" ||
                            item.status === "processing-failed" ||
                            item.status === "duplicate") && (
                            <CircleAlert className="mr-1 inline size-3" />
                          )}
                          {statusLabels[item.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                        <span>{item.file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFileSize(item.file.size)}</span>
                      </div>
                      {item.status === "uploading" && (
                        <div className="mt-2.5">
                          <div
                            role="progressbar"
                            aria-label={`Uploading ${item.file.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={item.progress}
                            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                          >
                            <div
                              className="h-full rounded-full bg-primary transition-[width]"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="mt-1 text-right text-[11px] text-muted">
                            {item.progress}%
                          </p>
                        </div>
                      )}
                      {item.message && (
                        <p
                          className={`mt-1.5 text-xs ${
                            item.status === "failed" ||
                            item.status === "processing-failed"
                              ? "text-rose-700"
                              : "text-amber-800"
                          }`}
                        >
                          {item.message}
                        </p>
                      )}
                    </div>
                    {!uploading && (
                      <div className="flex shrink-0 items-center gap-1">
                        {item.status === "failed" && item.retryable && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retry ${item.file.name}`}
                            onClick={() => retry(item.id)}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                        {(item.status === "queued" ||
                          item.status === "failed" ||
                          item.status === "duplicate") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => remove(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {success && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800"
          >
            {success}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={readyCount === 0 || uploading}
            onClick={submit}
          >
            {uploading && <LoaderCircle className="size-4 animate-spin" />}
            {uploading
              ? "Uploading…"
              : `Upload ${readyCount} ${readyCount === 1 ? "file" : "files"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
