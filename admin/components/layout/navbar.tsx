"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, Search, UserRound } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { PublicUser } from "@/lib/auth/types";

export function Navbar({
  title,
  onOpenMenu,
  user,
}: {
  title: string;
  onOpenMenu: () => void;
  user: PublicUser;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function signOut() {
    setLogoutError("");
    setIsSigningOut(true);
    try {
      await apiClient.post("/auth/logout");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(
        getApiErrorMessage(error, "Unable to sign out. Please try again."),
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur-xl">
      <div className="flex h-[72px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-9">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onOpenMenu}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-white text-slate-600 lg:hidden"
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:block">
              WORKSPACE
            </p>
            <h1 className="truncate text-sm font-semibold text-foreground sm:mt-0.5 sm:text-base">
              {title}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard/search"
            aria-label="Open semantic search"
            className="grid size-10 place-items-center rounded-xl border border-border bg-white text-slate-500 transition hover:border-primary/30 hover:text-primary"
          >
            <Search className="size-[17px]" />
          </Link>
          <span className="hidden h-7 w-px bg-border sm:block" />
          <div className="relative">
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              aria-label="Sign out"
              className="flex items-center gap-2 rounded-xl p-1.5 pr-2.5 transition hover:bg-slate-50 disabled:opacity-60"
            >
            <span className="grid size-8 place-items-center rounded-xl bg-violet-100 text-primary">
              <UserRound className="size-4" />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-36 truncate text-xs font-semibold text-slate-700">{user.name}</span>
              <span className="block text-[10px] text-slate-400">{user.role === "ADMIN" ? "Administrator" : "Member"}</span>
            </span>
            <LogOut className="ml-1 size-4 text-slate-400" />
            </button>
            {logoutError && (
              <p
                role="alert"
                className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-rose-200 bg-white p-3 text-xs leading-5 text-rose-700 shadow-lg"
              >
                {logoutError}
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
