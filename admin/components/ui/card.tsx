import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-[0_8px_28px_rgba(27,39,73,0.035)]",
        className,
      )}
      {...props}
    />
  );
}
