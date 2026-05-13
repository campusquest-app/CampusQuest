"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type CampusReport = {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  reviewedAt: string | null;
  moderatorNote: string | null;
  reporter: { id: string; username: string; display_name: string } | null;
  event?: { id: string; title: string; is_removed_by_moderation?: boolean } | null;
  organization?: { id: string; name: string; is_removed_by_moderation?: boolean } | null;
};

export function CampusContentModerationCard() {
  const [eventReports, setEventReports] = useState<CampusReport[]>([]);
  const [organizationReports, setOrganizationReports] = useState<CampusReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ eventReports: CampusReport[]; organizationReports: CampusReport[] }>(
        "/api/internal/admin/moderation/campus/reports?limit=100",
      );
      setEventReports(data.eventReports ?? []);
      setOrganizationReports(data.organizationReports ?? []);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load campus reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function resolveReport(entityType: "event" | "organization", reportId: string, status: "resolved" | "dismissed") {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed(`/api/internal/admin/moderation/campus/reports?entityType=${entityType}`, { reportId, status });
      setSuccess(status === "resolved" ? "Report resolved." : "Report dismissed.");
      await loadReports();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update report.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moderateContent(entityType: "event" | "organization", entityId: string, action: "remove" | "restore") {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/campus/content", { entityType, entityId, action });
      setSuccess(action === "remove" ? "Content removed from student feeds." : "Content restored.");
      await loadReports();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Could not update content state.");
    } finally {
      setSubmitting(false);
    }
  }

  const combined = [
    ...eventReports.map((report) => ({ ...report, entityType: "event" as const })),
    ...organizationReports.map((report) => ({ ...report, entityType: "organization" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <span aria-hidden>🛡️</span> Campus Content Moderation
          </h3>
          <p className="text-xs text-white/55 mt-1">Review reports for events and organizations, then remove or restore content.</p>
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

      {error ? <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {success ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</div>
      ) : null}
      {sessionExpired ? (
        <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to access moderation tools.
        </div>
      ) : null}

      <div className="space-y-3 max-h-[28rem] overflow-y-auto">
        {combined.length === 0 && !loading && !error && !sessionExpired ? (
          <p className="text-sm text-white/60">No event or organization reports in queue.</p>
        ) : null}
        {combined.map((report) => {
          const contentTitle = report.entityType === "event" ? report.event?.title : report.organization?.name;
          const contentId = report.entityType === "event" ? report.event?.id : report.organization?.id;
          const isRemoved =
            report.entityType === "event"
              ? Boolean(report.event?.is_removed_by_moderation)
              : Boolean(report.organization?.is_removed_by_moderation);
          return (
            <article key={`${report.entityType}-${report.id}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                  {new Date(report.createdAt).toLocaleString()} · <span className="uppercase">{report.status}</span>
                </p>
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300/35 text-amber-200">{report.reason}</span>
              </div>
              <p className="text-sm text-white/90">
                {report.entityType === "event" ? "Event" : "Organization"}: {contentTitle ?? "(Unavailable)"}
              </p>
              <p className="text-xs text-white/60">
                Reporter: {report.reporter?.display_name ?? "Unknown"} @{report.reporter?.username ?? "unknown"}
              </p>
              {report.details ? <p className="text-xs text-white/60">Details: {report.details}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting || report.status === "resolved"}
                  onClick={() => void resolveReport(report.entityType, report.id, "resolved")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 disabled:opacity-50"
                >
                  Resolve
                </button>
                <button
                  type="button"
                  disabled={submitting || report.status === "dismissed"}
                  onClick={() => void resolveReport(report.entityType, report.id, "dismissed")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/80 border border-white/20 disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={submitting || !contentId || isRemoved}
                  onClick={() => contentId && void moderateContent(report.entityType, contentId, "remove")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35 disabled:opacity-50"
                >
                  Remove Content
                </button>
                <button
                  type="button"
                  disabled={submitting || !contentId || !isRemoved}
                  onClick={() => contentId && void moderateContent(report.entityType, contentId, "restore")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/35 disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
