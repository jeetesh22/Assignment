import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ErrorState({
  title = "We couldn’t load this view",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex min-h-[270px] flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-rose-50 text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        {description}
      </p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry} variant="secondary">
          <RotateCw className="size-4" />
          Try again
        </Button>
      )}
    </Card>
  );
}
