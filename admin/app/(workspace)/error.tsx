"use client";

import { ErrorState } from "@/components/workspace/error-state";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <ErrorState
        title="Something went wrong"
        description="This page could not be rendered. You can retry without losing your current route."
        onRetry={reset}
      />
    </div>
  );
}
