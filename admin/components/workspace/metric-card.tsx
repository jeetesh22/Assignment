import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value = "—",
  description,
  icon: Icon,
}: {
  label: string;
  value?: string | number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{description}</p>
    </Card>
  );
}
