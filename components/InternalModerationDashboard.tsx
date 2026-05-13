"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import { AppealsModerationCard } from "@/components/AppealsModerationCard";
import { CampusContentModerationCard } from "@/components/CampusContentModerationCard";
import { ModerationDashboardCard } from "@/components/ModerationDashboardCard";
import { OrganizationModerationCard } from "@/components/OrganizationModerationCard";

function BackToQuadLink() {
  return (
    <Link
      href="/?tab=quad"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white"
    >
      ← Back to Quad
    </Link>
  );
}

export function InternalModerationDashboard() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyAccess = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    setSessionExpired(false);
    setError(null);
    try {
      await fetchAuthed<{ allowed: boolean; email: string | null }>("/api/internal/admin/access");
    } catch (accessError) {
      if (accessError instanceof ApiRequestError && accessError.status === 403) {
        setForbidden(true);
        return;
      }
      if (accessError instanceof ApiRequestError && accessError.status === 401) {
        setSessionExpired(true);
        return;
      }
      setError(accessError instanceof Error ? accessError.message : "Could not verify admin access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void verifyAccess();
  }, [verifyAccess]);

  if (loading) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <BackToQuadLink />
          <p className="text-sm text-white/70">Loading moderation dashboard...</p>
        </div>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5 space-y-4">
          <BackToQuadLink />
          <h1 className="text-xl font-display font-bold text-white">Internal Moderation</h1>
          <p className="text-sm text-amber-200">
            CampusQuest session unavailable in this browser tab. Sign in from the{" "}
            <Link href="/" className="font-semibold text-uri-keaney underline-offset-4 hover:underline">
              home screen
            </Link>
            , then reopen this page. If you were already signed in, your token may have expired—sign in again.
          </p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5 space-y-4">
          <BackToQuadLink />
          <h1 className="text-xl font-display font-bold text-white">Internal Moderation</h1>
          <p className="text-sm text-rose-200">You do not have permission to access this area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-4">
        <BackToQuadLink />
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Internal Moderation</h1>
          <p className="text-sm text-white/60">Review reported messages and appeals, then apply safety actions.</p>
        </div>
        {error ? <p className="text-xs text-rose-200">{error}</p> : null}
        <AppealsModerationCard />
        <ModerationDashboardCard />
        <CampusContentModerationCard />
        <OrganizationModerationCard />
      </div>
    </main>
  );
}
