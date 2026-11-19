"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import type { PublicUser } from "@/lib/auth/types";

function currentTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/documents/")) return "Document details";
  if (pathname === "/dashboard") return "Overview";
  if (pathname === "/dashboard/documents") return "Documents";
  if (pathname === "/dashboard/search") return "Semantic search";
  if (pathname === "/admin") return "Admin overview";
  if (pathname === "/admin/documents") return "All documents";
  if (pathname === "/admin/users") return "Users";
  if (pathname === "/admin/analytics") return "Analytics";
  return "Workspace";
}

export function WorkspaceShell({
  children,
  user,
}: {
  children: ReactNode;
  user: PublicUser;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar
        role={user.role}
        className="fixed inset-y-0 left-0 z-30 hidden w-[258px] lg:flex"
      />

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <Sidebar
            className="absolute inset-y-0 left-0 w-[286px] shadow-2xl"
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
            role={user.role}
          />
        </div>
      )}

      <div className="min-h-screen lg:pl-[258px]">
        <Navbar
          title={currentTitle(pathname)}
          onOpenMenu={() => setMobileOpen(true)}
          user={user}
        />
        <main className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 lg:px-9">
          {children}
        </main>
      </div>
    </div>
  );
}
