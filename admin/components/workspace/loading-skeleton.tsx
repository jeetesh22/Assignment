import { Card } from "@/components/ui/card";

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card
      aria-label="Loading content"
      aria-busy="true"
      className="overflow-hidden p-5 sm:p-6"
    >
      <div className="animate-pulse space-y-5">
        <div className="h-5 w-44 rounded-lg bg-slate-100" />
        <div className="h-4 w-72 max-w-full rounded-lg bg-slate-100" />
        <div className="space-y-3 pt-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-t border-slate-100 py-4"
            >
              <div className="size-9 rounded-xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-50" />
              </div>
              <div className="h-6 w-20 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
