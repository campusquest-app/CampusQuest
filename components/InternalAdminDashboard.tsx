"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import { AdminAuditLogsCard } from "@/components/AdminAuditLogsCard";
import { AppealsModerationCard } from "@/components/AppealsModerationCard";
import { BackendDashboardPreview } from "@/components/BackendDashboardPreview";
import { CampusContentModerationCard } from "@/components/CampusContentModerationCard";
import { LegalPolicyVersionCard } from "@/components/LegalPolicyVersionCard";
import { ModerationDashboardCard } from "@/components/ModerationDashboardCard";
import { OrganizationModerationCard } from "@/components/OrganizationModerationCard";
import { OrganizationCreationRequestsAdminCard } from "@/components/OrganizationCreationRequestsAdminCard";
import { PilotAnalyticsCard } from "@/components/PilotAnalyticsCard";
import { UserSafetyManagementCard } from "@/components/UserSafetyManagementCard";

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

export function InternalAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [allowedEmail, setAllowedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const verifyAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ allowed: boolean; adminAccess?: boolean; email: string | null }>("/api/internal/admin/access");
      if (!data.allowed) {
        setForbidden(true);
        return;
      }
      setAllowedEmail(data.email ?? null);
    } catch (accessError) {
      if (accessError instanceof ApiRequestError && accessError.status === 403) {
        setForbidden(true);
        return;
      }
      if (accessError instanceof ApiRequestError && accessError.status === 401) {
        setSessionExpired(true);
        return;
      }
      const message = accessError instanceof Error ? accessError.message : "Could not verify admin access.";
      setError(message);
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
        <div className="mx-auto max-w-6xl space-y-4">
          <BackToQuadLink />
          <p className="text-sm text-white/70">Loading internal admin dashboard...</p>
        </div>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5 space-y-4">
          <BackToQuadLink />
          <h1 className="text-xl font-display font-bold text-white">Internal Admin</h1>
          <p className="text-sm text-amber-200">Session expired. Please sign in again to access admin tools.</p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5 space-y-4">
          <BackToQuadLink />
          <h1 className="text-xl font-display font-bold text-white">Internal Admin</h1>
          <p className="text-sm text-rose-200">You do not have permission to access this area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <BackToQuadLink />
        <header className="space-y-1">
          <h1 className="text-2xl font-display font-bold text-white">CampusQuest Internal Admin</h1>
          <p className="text-sm text-white/60">Moderation, user safety, legal policy controls, and audit visibility.</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href="/internal/moderation"
              className="inline-flex items-center rounded-lg border border-uri-keaney/40 bg-uri-keaney/15 px-3 py-1.5 text-xs font-semibold text-uri-keaney hover:bg-uri-keaney/25"
            >
              Moderation workspace →
            </Link>
          </div>
          {allowedEmail ? <p className="text-xs text-white/45">Signed in as {allowedEmail}</p> : null}
          {error ? <p className="text-xs text-rose-200">{error}</p> : null}
        </header>

        <ModerationDashboardCard />
        <CampusContentModerationCard />
        <OrganizationModerationCard />
        <OrganizationCreationRequestsAdminCard />
        <UserSafetyManagementCard />
        <AppealsModerationCard />
        <PilotAnalyticsCard />
        <LegalPolicyVersionCard />
        <AdminAuditLogsCard />
        <p className="text-xs text-white/50">
          Backend preview below uses your signed-in admin session (same APIs as the student app). For rollout checks only.
        </p>
        <BackendDashboardPreview />
      </div>
    </main>
  );
}
