"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { AdminSectionId } from "@/lib/admin/navigation";
import { AdminKpiCard, AdminQuickAction, AdminSectionIntro } from "@/components/admin/AdminUi";

type Analytics = {
  totalUsers: number;
  verifiedUsers: number;
  eventsCreated: number;
  organizationsCreated: number;
  reportsSubmitted: number;
  dailyActiveUsers: number;
  dailyActiveStudents: number;
};

type SyncStatus = {
  lastSuccessfulSync: string | null;
  activeEventsCount: number;
  activeOrganizationsCount: number;
  lastError: string | null;
};

export function AdminDashboardHome({
  onNavigate,
}: {
  onNavigate: (section: AdminSectionId, hint?: string) => void;
}) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsResult, syncResult] = await Promise.allSettled([
        fetchAuthed<{ analytics: Analytics & { eventRsvps: number; messagesSent: number; generatedAt: string } }>(
          "/api/internal/admin/pilot-analytics",
        ),
        fetchAuthed<{ status: SyncStatus }>("/api/internal/admin/urinvolved-sync"),
      ]);
      if (analyticsResult.status === "fulfilled") {
        const a = analyticsResult.value.analytics;
        setAnalytics({
          totalUsers: a.totalUsers,
          verifiedUsers: a.verifiedUsers,
          eventsCreated: a.eventsCreated,
          organizationsCreated: a.organizationsCreated,
          reportsSubmitted: a.reportsSubmitted,
          dailyActiveUsers: a.dailyActiveUsers,
          dailyActiveStudents: a.dailyActiveStudents,
        });
      }
      if (syncResult.status === "fulfilled") {
        setSyncStatus(syncResult.value.status);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncHealthy = syncStatus && !syncStatus.lastError;

  return (
    <div className="space-y-6">
      <AdminSectionIntro
        title="Control Center"
        description="Key platform metrics and quick actions for daily admin work."
      />

      {loading ? <p className="text-sm text-white/50">Loading dashboard metrics…</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <AdminKpiCard label="Total Users" value={analytics?.totalUsers ?? "—"} />
        <AdminKpiCard label="Verified Users" value={analytics?.verifiedUsers ?? "—"} tone="success" />
        <AdminKpiCard label="Daily Active Users" value={analytics?.dailyActiveUsers ?? "—"} />
        <AdminKpiCard label="Daily Active Students" value={analytics?.dailyActiveStudents ?? "—"} tone="success" />
        <AdminKpiCard label="Events" value={analytics?.eventsCreated ?? "—"} />
        <AdminKpiCard label="Organizations" value={analytics?.organizationsCreated ?? "—"} />
        <AdminKpiCard
          label="Reports"
          value={analytics?.reportsSubmitted ?? "—"}
          tone={(analytics?.reportsSubmitted ?? 0) > 0 ? "warning" : "default"}
        />
        <AdminKpiCard label="Imported Events" value={syncStatus?.activeEventsCount ?? "—"} />
        <AdminKpiCard label="Imported Organizations" value={syncStatus?.activeOrganizationsCount ?? "—"} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <AdminQuickAction label="Run Sync" tone="primary" onClick={() => onNavigate("urinvolved")} />
          <AdminQuickAction label="Review Reports" onClick={() => onNavigate("moderation", "messages")} />
          <AdminQuickAction label="Approve Organizations" onClick={() => onNavigate("organizations", "requests")} />
          <AdminQuickAction label="Search User" onClick={() => onNavigate("moderation", "safety")} />
          <AdminQuickAction label="View Audit Logs" onClick={() => onNavigate("audit")} />
          <Link href="/?tab=events" className="cq-admin-action cq-admin-action--default text-center">
            View Imported Events
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="cq-admin-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">URInvolved Sync Health</p>
          <p className={`mt-2 text-lg font-semibold ${syncHealthy ? "text-emerald-300" : "text-amber-300"}`}>
            {syncHealthy ? "Healthy" : "Needs attention"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Last success:{" "}
            {syncStatus?.lastSuccessfulSync ? new Date(syncStatus.lastSuccessfulSync).toLocaleString() : "Never"}
          </p>
        </div>
        <div className="cq-admin-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Moderation Queue</p>
          <p className="mt-2 text-lg font-semibold text-white">{analytics?.reportsSubmitted ?? 0} reports submitted</p>
          <p className="mt-1 text-xs text-white/50">Review message and content reports in Moderation.</p>
        </div>
      </div>
    </div>
  );
}
