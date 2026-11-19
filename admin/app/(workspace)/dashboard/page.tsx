import Link from "next/link";
import {
  ArrowUpRight,
  Files,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/workspace/page-header";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { DashboardMetrics } from "@/components/workspace/dashboard-metrics";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Your workspace, at a glance"
        description="A clear home for your documents, summaries, and discoveries."
        action={
          <>
            <Link
              href="/dashboard/search"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Search className="size-4" />
              Search
            </Link>
            <UploadDialog />
          </>
        }
      />

      <section className="relative mb-6 overflow-hidden rounded-[26px] bg-[#1a1d36] p-6 text-white shadow-xl shadow-indigo-950/10 sm:p-8 lg:p-9">
        <div className="absolute -right-20 -top-32 size-80 rounded-full border border-white/[0.07]" />
        <div className="absolute -right-8 -top-20 size-56 rounded-full border border-white/[0.07]" />
        <div className="absolute -bottom-28 right-24 size-60 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-violet-100">
            <Sparkles className="size-3.5" />A more thoughtful way to work with
            documents
          </span>
          <h2 className="mt-5 max-w-xl text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">
            Bring your knowledge together.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
            Connect your account to start uploading documents and exploring
            their meaning. Workspace metrics will appear when real data is
            available.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <UploadDialog />
            <Link href="/dashboard/documents">
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 hover:text-white">
                View documents <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </div>
        </div>
        <span className="absolute bottom-8 right-10 hidden size-20 place-items-center rounded-[26px] border border-white/10 bg-white/[0.05] text-violet-200 backdrop-blur md:grid">
          <Files className="size-8" strokeWidth={1.4} />
        </span>
      </section>

      <DashboardMetrics />

    </div>
  );
}
