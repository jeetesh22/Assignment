"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Files,
  LayoutDashboard,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand-logo";

type WorkspaceRole = "USER" | "ADMIN";

const navigationGroups: {
  label: string;
  roles: readonly WorkspaceRole[];
  items: { label: string; href: string; icon: LucideIcon }[];
}[] = [
  {
    label: "Workspace",
    roles: ["USER", "ADMIN"],
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Documents", href: "/dashboard/documents", icon: Files },
      { label: "Semantic search", href: "/dashboard/search", icon: Search },
    ],
  },
  {
    label: "Administration",
    roles: ["ADMIN"],
    items: [
      { label: "Admin overview", href: "/admin", icon: Shield },
      { label: "All documents", href: "/admin/documents", icon: Files },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
];

export function Sidebar({
  className,
  onNavigate,
  onClose,
  role,
}: {
  className?: string;
  onNavigate?: () => void;
  onClose?: () => void;
  role: "USER" | "ADMIN";
}) {
  const pathname = usePathname();

  return (
    <aside className={cn("relative flex h-full flex-col bg-[#111827]", className)}>
      {onClose && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute right-3 top-4 z-10 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      )}
      <div className="flex h-full flex-col px-4 pb-5 pt-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="mb-9 flex items-center px-2"
        >
          <BrandLogo className="h-8 w-auto max-w-[130px]" />
        </Link>

        <nav aria-label="Main navigation" className="space-y-7">
          {navigationGroups
            .filter((group) => group.roles.includes(role))
            .map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active =
                    pathname === href ||
                    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                        active
                          ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[17px]",
                          active
                            ? "text-violet-200"
                            : "text-slate-500 group-hover:text-slate-300",
                        )}
                      />
                      <span className="flex-1">{label}</span>
                      {active && <ChevronRight className="size-3.5 text-slate-500" />}
                    </Link>
                  );
                })}
              </div>
            </div>
            ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
            <span className="size-1.5 rounded-full bg-violet-300" />
            Getting started
          </div>
          <p className="text-xs leading-5 text-slate-400">
            Connect your account to start managing documents.
          </p>
          <Link
            href="/login"
            onClick={onNavigate}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-200 hover:text-white"
          >
            Sign in <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
