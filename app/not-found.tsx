"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Fallback when Next shows the global not-found UI. We avoid server `redirect("/")` here
 * (it can trigger ERR_TOO_MANY_REDIRECTS). For any non-home path, do a single full
 * navigation to `/` so the real app shell loads reliably.
 */
export default function NotFound() {
  const [stuckOnHome, setStuckOnHome] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/" || path === "") {
      setStuckOnHome(true);
      return;
    }
    window.location.replace("/");
  }, []);

  if (stuckOnHome) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-uri-navy bg-gradient-to-b from-uri-navy from-0% via-[#061e3a] via-40% to-[#041a35] to-100% text-white px-6">
        <p className="font-display text-lg font-semibold text-uri-keaney/95">Could not load CampusQuest</p>
        <p className="mt-2 text-sm text-white/60 text-center max-w-sm">
          The app shell did not render on the home URL. Try a hard refresh (Cmd+Shift+R or Ctrl+Shift+R), restart{" "}
          <code className="text-white/80">npm run dev</code>, or clear site data for this localhost origin.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-uri-keaney/20 border border-uri-keaney/50 px-5 py-2.5 text-sm font-semibold text-uri-keaney hover:bg-uri-keaney/30 transition-colors"
        >
          Reload page
        </button>
        <Link
          href="/"
          className="mt-3 text-sm text-uri-keaney/90 underline underline-offset-4 hover:text-uri-keaney"
        >
          Open home again
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-uri-navy bg-gradient-to-b from-uri-navy from-0% via-[#061e3a] via-40% to-[#041a35] to-100% text-white px-6">
      <p className="font-display text-sm font-semibold tracking-wide text-uri-keaney/90">Opening CampusQuest…</p>
    </div>
  );
}
