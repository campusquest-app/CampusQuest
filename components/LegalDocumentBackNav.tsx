"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

/** Shared top bar for standalone legal/agreement markdown-style pages — matches CQ header/nav feel. */
export function LegalDocumentBackNav() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.push("/agreement");
  }, [router]);

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center px-4 pt-6 pb-4 sm:pt-8 sm:pb-6">
      <button
        type="button"
        onClick={handleBack}
        className="group relative flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] p-3 text-white/92 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-sm transition-[color,background-color,border-color,opacity,transform] duration-150 hover:border-uri-keaney/45 hover:bg-uri-keaney/[0.12] hover:text-white active:translate-y-[0.5px] active:scale-[0.97] active:opacity-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uri-keaney/70 focus-visible:ring-offset-2 focus-visible:ring-offset-uri-navy touch-manipulation"
        aria-label="Back to agreement"
      >
        <ArrowLeft
          className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5 group-active:-translate-x-0.5"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 shadow-[0_0_28px_-4px_rgba(104,171,232,0.65)] transition-opacity duration-200 group-hover:opacity-55 group-active:opacity-35"
          aria-hidden
        />
      </button>
    </div>
  );
}
