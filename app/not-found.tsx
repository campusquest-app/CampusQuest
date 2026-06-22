"use client";

import Link from "next/link";

export default function NotFound() {
  function handleGoBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-uri-navy bg-gradient-to-b from-uri-navy via-[#061e3a] to-[#041a35] px-6 py-10 text-white">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-uri-keaney/90">CampusQuest</p>
      <h1 className="mt-3 font-display text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-white/60">
        This link may be broken or the page may have moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-w-[7.5rem] items-center justify-center rounded-xl bg-uri-keaney px-5 py-2.5 text-sm font-semibold text-uri-navy transition hover:bg-uri-keaney/90"
        >
          Go to Quad
        </Link>
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex min-w-[7.5rem] items-center justify-center rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
