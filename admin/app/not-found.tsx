import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
          <SearchX className="size-6" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          404 · Not found
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          This page isn’t here
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The link may be incorrect, or the page may have moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" /> Back to workspace
        </Link>
      </div>
    </main>
  );
}
