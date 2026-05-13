"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import { AppealsModerationCard } from "@/components/AppealsModerationCard";
import { CampusContentModerationCard } from "@/components/CampusContentModerationCard";
import { ModerationDashboardCard } from "@/components/ModerationDashboardCard";
import { OrganizationModerationCard } from "@/components/OrganizationModerationCard";

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
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-white/70">Loading moderation dashboard...</p>
        </div>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5">
          <h1 className="text-xl font-display font-bold text-white">Internal Moderation</h1>
          <p className="mt-2 text-sm text-amber-200">Session expired. Please sign in again.</p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5">
          <h1 className="text-xl font-display font-bold text-white">Internal Moderation</h1>
          <p className="mt-2 text-sm text-rose-200">You do not have permission to access this area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-display font-bold text-white">Internal Moderation</h1>
        <p className="text-sm text-white/60">Review reported messages and appeals, then apply safety actions.</p>
        {error ? <p className="text-xs text-rose-200">{error}</p> : null}
        <AppealsModerationCard />
        <ModerationDashboardCard />
        <CampusContentModerationCard />
        <OrganizationModerationCard />
      </div>
    </main>
  );
}
