"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACCESS_TOKEN_STORAGE_KEY, waitForClientAccessToken } from "@/lib/client/apiSession";

type GateState = "checking" | "ready" | "no_session";

/**
 * Internal tools load before localStorage may be readable in some navigation races.
 * Short wait + optional cross-tab storage updates prevent false “no token” flashes.
 */
export function AdminRouteSessionGate({ title, children }: { title: string; children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const ok = await waitForClientAccessToken(720);
      if (cancelled) return;
      setState(ok ? "ready" : "no_session");
    }

    void probe();

    function onStorage(e: StorageEvent) {
      if (e.key !== ACCESS_TOKEN_STORAGE_KEY) return;
      void probe();
    }
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (state === "checking") {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-xl space-y-2">
          <h1 className="text-xl font-display font-bold text-white">{title}</h1>
          <p className="text-sm text-white/70">Checking session…</p>
        </div>
      </main>
    );
  }

  if (state === "no_session") {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-xl card p-6 space-y-4">
          <h1 className="text-xl font-display font-bold text-white">{title}</h1>
          <p className="text-sm text-amber-200">
            No CampusQuest session in this browser tab. Sign in from the main campus app first (home), then return to this internal
            page.
          </p>
          <Link
            href="/"
            className="inline-flex rounded-lg bg-uri-keaney px-4 py-2 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90"
          >
            Open CampusQuest home
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
