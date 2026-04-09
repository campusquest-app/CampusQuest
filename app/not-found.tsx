"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fallback when no App Router page matches (wrong URL, stale tunnel, etc.).
 * Sends users back to the real app shell instead of leaving them on the default Next.js 404.
 */
export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-uri-navy bg-gradient-to-b from-uri-navy from-0% via-[#061e3a] via-40% to-[#041a35] to-100% text-white px-6">
      <p className="font-display text-sm font-semibold tracking-wide text-uri-keaney/90">
        Taking you to CampusQuest…
      </p>
      <p className="mt-2 text-xs text-white/55 text-center max-w-sm">
        If this keeps happening, confirm you are on the same port as <code className="text-white/80">npm run dev</code> (for example{" "}
        <code className="text-white/80">localhost:3002</code>).
      </p>
    </div>
  );
}
