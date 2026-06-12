"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";
import type { AdminSectionId, ModerationTabId, OrganizationsTabId } from "@/lib/admin/navigation";
import { AdminAnalyticsSection } from "@/components/admin/AdminAnalyticsSection";
import { AdminAuditSection } from "@/components/admin/AdminAuditSection";
import { AdminDashboardHome } from "@/components/admin/AdminDashboardHome";
import { AdminLegalSection } from "@/components/admin/AdminLegalSection";
import { AdminModerationSection } from "@/components/admin/AdminModerationSection";
import { AdminOrganizationsSection } from "@/components/admin/AdminOrganizationsSection";
import type { AdminSearchNavigatePayload } from "@/components/admin/AdminGlobalSearch";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSystemSection } from "@/components/admin/AdminSystemSection";
import { AdminUrinvolvedSection } from "@/components/admin/AdminUrinvolvedSection";

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
  const [section, setSection] = useState<AdminSectionId>("dashboard");
  const [moderationTab, setModerationTab] = useState<ModerationTabId>("messages");
  const [organizationsTab, setOrganizationsTab] = useState<OrganizationsTabId>("requests");
  const [safetyQuery, setSafetyQuery] = useState<string | undefined>();
  const [auditQuery, setAuditQuery] = useState<string | undefined>();
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  const verifyAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ allowed: boolean; adminAccess?: boolean; email: string | null }>(
        "/api/internal/admin/access",
      );
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

  function navigate(sectionId: AdminSectionId, hint?: string) {
    setSection(sectionId);
    if (sectionId === "moderation") {
      if (hint === "safety") setModerationTab("safety");
      else if (hint === "content") setModerationTab("content");
      else if (hint === "appeals") setModerationTab("appeals");
      else setModerationTab("messages");
    }
    if (sectionId === "organizations") {
      setOrganizationsTab(hint === "controls" ? "controls" : "requests");
    }
  }

  function handleSearchNavigate(payload: AdminSearchNavigatePayload) {
    setSection(payload.section);
    if (payload.moderationTab) setModerationTab(payload.moderationTab);
    if (payload.organizationsTab) setOrganizationsTab(payload.organizationsTab);
    setSafetyQuery(payload.safetyQuery);
    setAuditQuery(payload.auditQuery);
    setOrganizationId(payload.organizationId);
  }

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
          <p className="text-sm text-amber-200">
            CampusQuest session unavailable in this browser tab. Sign in from the{" "}
            <Link href="/" className="font-semibold text-uri-keaney underline-offset-4 hover:underline">
              home screen
            </Link>
            , then open Internal Admin again.
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
          <h1 className="text-xl font-display font-bold text-white">Internal Admin</h1>
          <p className="text-sm text-rose-200">You do not have permission to access this area.</p>
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      activeSection={section}
      onSectionChange={setSection}
      onSearchNavigate={handleSearchNavigate}
      allowedEmail={allowedEmail}
    >
      {error ? <p className="mb-4 text-xs text-rose-200">{error}</p> : null}
      {section === "dashboard" ? <AdminDashboardHome onNavigate={navigate} /> : null}
      {section === "moderation" ? (
        <AdminModerationSection
          activeTab={moderationTab}
          onTabChange={setModerationTab}
          initialSafetyQuery={safetyQuery}
        />
      ) : null}
      {section === "organizations" ? (
        <AdminOrganizationsSection
          activeTab={organizationsTab}
          onTabChange={setOrganizationsTab}
          initialOrganizationId={organizationId}
        />
      ) : null}
      {section === "urinvolved" ? <AdminUrinvolvedSection /> : null}
      {section === "analytics" ? <AdminAnalyticsSection /> : null}
      {section === "audit" ? <AdminAuditSection initialSearch={auditQuery} /> : null}
      {section === "legal" ? <AdminLegalSection /> : null}
      {section === "system" ? <AdminSystemSection /> : null}
    </AdminShell>
  );
}
