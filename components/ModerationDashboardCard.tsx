"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type ModerationReport = {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
  reviewedAt: string | null;
  moderatorNote: string | null;
  message: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    recipientId: string;
  } | null;
  reporter: {
    id: string;
    username: string;
    displayName: string;
  } | null;
  reportedUser: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

export function ModerationDashboardCard() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ reports: ModerationReport[] }>("/api/internal/admin/moderation/messages/reports?limit=100");
      setReports(data.reports ?? []);
      setForbidden(false);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      if (loadError instanceof ApiRequestError && loadError.status === 403) {
        setForbidden(true);
        return;
      }
      const message = loadError instanceof Error ? loadError.message : "Could not load moderation reports.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function updateReportStatus(reportId: string, status: "resolved" | "dismissed") {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/messages/reports", { reportId, status });
      setSuccess(status === "resolved" ? "Report resolved." : "Report dismissed.");
      await loadReports();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Could not update report status.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function suspendReportedUser(report: ModerationReport) {
    if (!report.reportedUser?.id) return;
    const reasonInput = window.prompt("Optional suspension reason:", `Moderation action from report ${report.id}`) ?? "";
    const expiresInput =
      window.prompt("Optional suspension expiration (ISO, e.g. 2026-06-01T00:00:00Z). Leave blank for no expiry:", "") ?? "";
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/users/status", {
        userId: report.reportedUser.id,
        status: "suspended",
        reason: reasonInput.trim() || undefined,
        suspendedUntil: expiresInput.trim() || undefined,
      });
      setSuccess("Reported user suspended.");
      await loadReports();
    } catch (suspendError) {
      const message = suspendError instanceof Error ? suspendError.message : "Could not suspend user.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function banReportedUser(report: ModerationReport) {
    if (!report.reportedUser?.id) return;
    const reasonInput = window.prompt("Optional ban reason:", `Moderation action from report ${report.id}`) ?? "";
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/users/status", {
        userId: report.reportedUser.id,
        status: "banned",
        reason: reasonInput.trim() || undefined,
      });
      setSuccess("Reported user banned.");
      await loadReports();
    } catch (banError) {
      const message = banError instanceof Error ? banError.message : "Could not ban user.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) return null;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <span aria-hidden>🧯</span> Moderation Dashboard
          </h3>
          <p className="text-xs text-white/55 mt-1">Reported message queue for internal safety review.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadReports()}
          disabled={loading || submitting}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</div>
      ) : null}
      {sessionExpired ? (
        <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to access moderation tools.
        </div>
      ) : null}

      <div className="space-y-3 max-h-[28rem] overflow-y-auto">
        {reports.length === 0 && !loading && !error && !sessionExpired ? (
          <p className="text-sm text-white/60">No reports in queue.</p>
        ) : null}
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-white/50">
                {new Date(report.createdAt).toLocaleString()} · <span className="uppercase">{report.status}</span>
              </p>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300/35 text-amber-200">{report.reason}</span>
            </div>
            <p className="text-sm text-white/90">{report.message?.content ?? "(Message unavailable)"}</p>
            <p className="text-xs text-white/60">
              Reporter: {report.reporter?.displayName ?? "Unknown"} @{report.reporter?.username ?? "unknown"} · Reported:{" "}
              {report.reportedUser?.displayName ?? "Unknown"} @{report.reportedUser?.username ?? "unknown"}
            </p>
            {report.details ? <p className="text-xs text-white/60">Details: {report.details}</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={submitting || report.status === "resolved"}
                onClick={() => void updateReportStatus(report.id, "resolved")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 disabled:opacity-50"
              >
                Resolve Report
              </button>
              <button
                type="button"
                disabled={submitting || report.status === "dismissed"}
                onClick={() => void updateReportStatus(report.id, "dismissed")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/80 border border-white/20 disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={submitting || !report.reportedUser?.id}
                onClick={() => void suspendReportedUser(report)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35 disabled:opacity-50"
              >
                Suspend User
              </button>
              <button
                type="button"
                disabled={submitting || !report.reportedUser?.id}
                onClick={() => void banReportedUser(report)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-700/25 text-rose-100 border border-rose-500/45 disabled:opacity-50"
              >
                Ban User
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
