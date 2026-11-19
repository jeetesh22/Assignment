import { Suspense } from "react";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { LoadingSkeleton } from "@/components/workspace/loading-skeleton";
import { getCurrentUser } from "@/lib/auth/server";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-5 py-10 sm:px-8">
          <LoadingSkeleton />
        </main>
      }
    >
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
