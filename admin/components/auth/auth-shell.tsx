import Link from "next/link";
import { ArrowRight, FileText, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#111827] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-black/20 sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[34px] lg:grid-cols-[1.08fr_0.92fr]">
        <aside className="relative hidden overflow-hidden bg-[#111827] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-12">
          <div className="absolute -right-36 -top-32 size-[520px] rounded-full border border-white/[0.06]" />
          <div className="absolute -right-20 -top-16 size-[380px] rounded-full border border-white/[0.07]" />
          <div className="absolute -bottom-48 -left-36 size-[500px] rounded-full bg-violet-500/10 blur-3xl" />

          <Link
            href="/login"
            className="relative z-10 inline-flex w-fit items-center gap-3"
          >
            <BrandLogo className="h-10 w-auto" priority />
          </Link>

          <div className="relative z-10 my-10 max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-violet-100">
              <span className="size-1.5 rounded-full bg-violet-300" />
              DOCUMENT INTELLIGENCE
            </p>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-[-0.045em] xl:text-5xl">
              Every document.
              <br />
              <span className="text-violet-200">A little more understood.</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              Bring your documents into one thoughtful workspace. Find the
              details that matter, without losing the source.
            </p>

            <div className="mt-10 max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/10 backdrop-blur">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-violet-400/10 text-violet-200">
                    <FileText className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      One connected workspace
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      A clearer way to work with knowledge
                    </p>
                  </div>
                </div>
                <LockKeyhole className="size-4 text-slate-500" />
              </div>
              <div className="space-y-3">
                {[
                  "Find meaning across documents",
                  "Keep source context close",
                  "Move from upload to insight",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 text-xs text-slate-300"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
                      <ArrowRight className="size-3" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="relative z-10 text-xs text-slate-500">
            A calm place for your document knowledge.
          </p>
        </aside>

        <main className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-16">
          <div className="w-full max-w-[410px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
