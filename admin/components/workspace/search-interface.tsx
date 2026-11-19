"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { SubmitHandler } from "react-hook-form";
import Link from "next/link";
import { z } from "zod";
import {
  ArrowUpRight,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/workspace/error-state";
import { EmptyState } from "@/components/workspace/empty-state";
import { getApiErrorMessage } from "@/lib/api/errors";
import { searchDocuments } from "@/lib/api/search";
import type { SearchResult } from "@/lib/api/search";
import { listDocuments } from "@/lib/api/documents";
import type { DocumentListItem } from "@/lib/api/documents";

const formSchema = z.object({
  query: z.string().trim().min(2, "Enter at least 2 characters.").max(2000),
});

type SearchValues = z.infer<typeof formSchema>;

export function SearchInterface() {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [failure, setFailure] = useState("");
  const [searched, setSearched] = useState(false);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [documentPage, setDocumentPage] = useState(1);
  const [documentPages, setDocumentPages] = useState(0);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentFilterError, setDocumentFilterError] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedFileType, setSelectedFileType] = useState<
    "" | "PDF" | "TXT"
  >("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SearchValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { query: "" },
  });

  useEffect(() => {
    const controller = new AbortController();
    listDocuments(1, 100, controller.signal)
      .then((response) => {
        setDocuments(response.items);
        setDocumentPages(response.pages);
        setDocumentPage(1);
        setDocumentFilterError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDocumentFilterError(
            getApiErrorMessage(
              reason,
              "Document filters could not be loaded.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDocuments(false);
      });

    return () => controller.abort();
  }, []);

  async function loadMoreDocuments() {
    setLoadingDocuments(true);
    setDocumentFilterError("");
    try {
      const response = await listDocuments(documentPage + 1, 100);
      setDocuments((current) => [...current, ...response.items]);
      setDocumentPage(response.page);
      setDocumentPages(response.pages);
    } catch (reason) {
      setDocumentFilterError(
        getApiErrorMessage(reason, "More documents could not be loaded."),
      );
    } finally {
      setLoadingDocuments(false);
    }
  }

  const onSubmit: SubmitHandler<SearchValues> = async ({ query }) => {
    setSearched(true);
    setResults(null);
    setFailure("");
    try {
      const response = await searchDocuments(query, {
        ...(selectedDocumentId ? { documentId: selectedDocumentId } : {}),
        ...(selectedFileType ? { fileType: selectedFileType } : {}),
      });
      setResults(
        [...response.results].sort((left, right) => right.score - left.score),
      );
    } catch (reason) {
      setFailure(
        getApiErrorMessage(
          reason,
          "Search could not be completed. Please try again.",
        ),
      );
    }
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-primary">
            <Sparkles className="size-[18px]" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Ask your documents
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              Search by meaning to find relevant passages across your library.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <label htmlFor="semantic-query" className="sr-only">
            Search query
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                id="semantic-query"
                placeholder="Ask a question or describe what you’re looking for..."
                aria-invalid={Boolean(errors.query)}
                aria-describedby={errors.query ? "semantic-query-error" : undefined}
                disabled={isSubmitting}
                {...register("query")}
              />
              {errors.query && (
                <p
                  id="semantic-query-error"
                  role="alert"
                  className="mt-1.5 text-xs text-danger"
                >
                  {errors.query.message}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {isSubmitting ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="search-document-filter"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Document
            </label>
            <select
              id="search-document-filter"
              value={selectedDocumentId}
              disabled={loadingDocuments || isSubmitting}
              onChange={(event) => {
                setSelectedDocumentId(event.target.value);
                setResults(null);
                setSearched(false);
                setFailure("");
              }}
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-60"
            >
              <option value="">All documents</option>
              {documents
                .filter((document) => document.status === "COMPLETED")
                .map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title} ({document.fileType})
                  </option>
                ))}
            </select>
            {documentPages > documentPage && (
              <button
                type="button"
                disabled={loadingDocuments || isSubmitting}
                onClick={loadMoreDocuments}
                className="mt-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60"
              >
                {loadingDocuments ? "Loading documents…" : "Load more documents"}
              </button>
            )}
          </div>
          <div>
            <label
              htmlFor="search-file-type-filter"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              File type
            </label>
            <select
              id="search-file-type-filter"
              value={selectedFileType}
              disabled={isSubmitting}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "" || value === "PDF" || value === "TXT") {
                  setSelectedFileType(value);
                  setResults(null);
                  setSearched(false);
                  setFailure("");
                }
              }}
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-60"
            >
              <option value="">All file types</option>
              <option value="PDF">PDF</option>
              <option value="TXT">TXT</option>
            </select>
          </div>
        </div>
        {documentFilterError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {documentFilterError}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Results use vector similarity and respect your document access. Filter
          by one document or file type.
        </p>
      </Card>

      {isSubmitting ? (
        <Card
          className="flex min-h-44 items-center justify-center gap-3 p-8 text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-5 animate-spin text-primary" />
          Searching your documents…
        </Card>
      ) : failure ? (
        <ErrorState
          title="Search couldn’t be completed"
          description={failure}
          onRetry={handleSubmit(onSubmit)}
        />
      ) : results && results.length > 0 ? (
        <section aria-label="Search results" aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-semibold text-foreground">
              Ranked results
            </h3>
            <span className="text-xs text-muted">
              {results.length} {results.length === 1 ? "match" : "matches"}
            </span>
          </div>
          <ol className="space-y-3">
            {results.map((result, index) => {
              const scorePercent = Math.round(
                Math.max(0, Math.min(1, result.score)) * 100,
              );
              return (
                <li key={`${result.documentId}-${index}`}>
                  <Card className="p-5 transition-shadow hover:shadow-[0_12px_36px_rgba(27,39,73,0.08)] sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Result {index + 1}
                      </span>
                      <div
                        className="flex items-center gap-2 text-xs font-semibold text-primary"
                        aria-label={`Cosine similarity score ${result.score.toFixed(3)}`}
                      >
                        <span>Cosine similarity {result.score.toFixed(3)}</span>
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-violet-100"
                        >
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${scorePercent}%` }}
                          />
                        </span>
                      </div>
                    </div>
                    <h4 className="text-base font-semibold tracking-tight text-foreground">
                      <Link
                        href={`/dashboard/documents/${encodeURIComponent(result.documentId)}`}
                        className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                      >
                        {result.title}
                      </Link>
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {result.snippet}
                    </p>
                    <Link
                      href={`/dashboard/documents/${encodeURIComponent(result.documentId)}`}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
                    >
                      View document
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>
      ) : searched && results ? (
        <EmptyState
          icon={Search}
          title="No matching passages"
          description="Try a different phrase or ask your question in another way."
        />
      ) : (
        <EmptyState
          icon={Search}
          title="Search your knowledge base"
          description="Enter a natural-language query above to find relevant passages in your documents."
        />
      )}
    </div>
  );
}
