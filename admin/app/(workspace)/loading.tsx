import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-5">
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-8 w-64 rounded-lg bg-slate-200" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <LoadingSkeleton />
    </div>
  );
}
