"use client";

import { useState } from "react";
import {
  Check,
  Clipboard,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  isSummaryGenerating,
  type DocumentStatus,
  type SummaryGenerationStatus,
  type SummaryType,
} from "@/lib/api/documents";

const summaryTypes: { value: SummaryType; label: string }[] = [
  { value: "SHORT", label: "Short summary" },
  { value: "DETAILED", label: "Detailed summary" },
  { value: "BULLET_POINTS", label: "Bullet-point summary" },
  { value: "EXECUTIVE", label: "Executive summary" },
  { value: "KEY_INSIGHTS", label: "Key insights" },
  { value: "KEYWORDS", label: "Important keywords" },
];

export function AiSummaryViewer({
  summary,
  summaries,
  documentStatus,
  processingError,
  generationStatus,
  generationType,
  generationError,
  canGenerate,
  onGenerate,
}: {
  summary: string | null;
  summaries: Partial<Record<SummaryType, string>>;
  documentStatus: DocumentStatus;
  processingError?: string;
  generationStatus: SummaryGenerationStatus;
  generationType: SummaryType;
  generationError?: string;
  canGenerate: boolean;
  onGenerate: (type: SummaryType) => Promise<void>;
}) {
  const [selectedType, setSelectedType] = useState<SummaryType>("SHORT");
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const selectedSummary =
    summaries[selectedType] ||
    (selectedType === "SHORT" ? summary ?? "" : "");
  const generating = isSummaryGenerating(generationStatus);
  const generatingSelectedType = generating && generationType === selectedType;

  async function handleGenerate() {
    setFeedback(null);
    setRequesting(true);
    try {
      await onGenerate(selectedType);
    } catch (error) {
      setFeedback({
        message: getApiErrorMessage(error, "Summary generation failed."),
        error: true,
      });
    } finally {
      setRequesting(false);
    }
  }

  async function handleCopy() {
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(selectedSummary);
      setFeedback({ message: "Summary copied to clipboard.", error: false });
    } catch {
      setFeedback({
        message: "Could not copy the summary. Check clipboard permissions.",
        error: true,
      });
    }
  }

  const missingMessage =
    generationStatus === "FAILED" && generationType === selectedType
      ? generationError || "Summary generation failed. Try again."
      : generatingSelectedType
        ? generationStatus === "QUEUED"
          ? "Your summary is queued and will begin shortly."
          : "The AI is generating this summary."
        : documentStatus === "FAILED"
          ? processingError || "Document processing failed."
          : documentStatus === "SUMMARIZING" && selectedType === "SHORT"
            ? "The short summary is being generated."
            : canGenerate
              ? "No saved summary in this format yet. Generate one from the extracted document text."
              : "A summary will be available after document text has been extracted.";

  return (
    <Card className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              AI document insights
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Generated only from this document’s extracted text
            </p>
          </div>
        </div>
        {selectedSummary && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" />
            Saved to document
          </span>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="summary-type">
          Summary format
        </label>
        <select
          id="summary-type"
          value={selectedType}
          onChange={(event) => {
            const option = summaryTypes.find(
              ({ value }) => value === event.target.value,
            );
            if (option) setSelectedType(option.value);
            setFeedback(null);
          }}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          {summaryTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canGenerate || generating || requesting}
            onClick={handleGenerate}
          >
            {requesting || generatingSelectedType ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {selectedSummary ? "Regenerate" : "Generate"}
          </Button>
          {selectedSummary && (
            <Button type="button" variant="ghost" onClick={handleCopy}>
              <Clipboard className="size-4" />
              Copy
            </Button>
          )}
        </div>
      </div>

      {generatingSelectedType && (
        <p role="status" className="mb-4 text-sm text-primary">
          {generationStatus === "QUEUED"
            ? "Summary generation is queued."
            : "Generating summary…"}
        </p>
      )}
      {generating && !generatingSelectedType && (
        <p role="status" className="mb-4 text-sm text-primary">
          The {generationType.toLowerCase().replaceAll("_", " ")} summary is
          being generated. You can request another format afterward.
        </p>
      )}
      {generationStatus === "FAILED" &&
        generationType === selectedType &&
        generationError && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {generationError}
          </p>
        )}

      {selectedSummary ? (
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
          {selectedSummary}
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-slate-50/70 px-4 py-5 text-sm leading-6 text-muted">
          {missingMessage}
        </p>
      )}

      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`mt-4 text-sm ${
            feedback.error ? "text-danger" : "text-emerald-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </Card>
  );
}
