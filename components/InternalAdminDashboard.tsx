"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import { AdminAuditLogsCard } from "@/components/AdminAuditLogsCard";
import { AppealsModerationCard } from "@/components/AppealsModerationCard";
import { CampusContentModerationCard } from "@/components/CampusContentModerationCard";
import { LegalPolicyVersionCard } from "@/components/LegalPolicyVersionCard";
import { ModerationDashboardCard } from "@/components/ModerationDashboardCard";
import { OrganizationModerationCard } from "@/components/OrganizationModerationCard";
import { PilotAnalyticsCard } from "@/components/PilotAnalyticsCard";
import { UserSafetyManagementCard } from "@/components/UserSafetyManagementCard";

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
      const data = await fetchAuthed<{ allowed: boolean; email: string | null }>("/api/internal/admin/access");
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
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-white/70">Loading internal admin dashboard...</p>
        </div>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5">
          <h1 className="text-xl font-display font-bold text-white">Internal Admin</h1>
          <p className="mt-2 text-sm text-amber-200">Session expired. Please sign in again to access admin tools.</p>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-3xl card p-5">
          <h1 className="text-xl font-display font-bold text-white">Internal Admin</h1>
          <p className="mt-2 text-sm text-rose-200">You do not have permission to access this area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-display font-bold text-white">CampusQuest Internal Admin</h1>
          <p className="text-sm text-white/60">Moderation, user safety, legal policy controls, and audit visibility.</p>
          {allowedEmail ? <p className="text-xs text-white/45">Signed in as {allowedEmail}</p> : null}
          {error ? <p className="text-xs text-rose-200">{error}</p> : null}
        </header>

        <ModerationDashboardCard />
        <CampusContentModerationCard />
        <OrganizationModerationCard />
        <UserSafetyManagementCard />
        <AppealsModerationCard />
        <PilotAnalyticsCard />
        <LegalPolicyVersionCard />
        <AdminAuditLogsCard />
      </div>
    </main>
  );
}
