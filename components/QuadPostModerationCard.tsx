"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { quadPostReportReasonLabel } from "@/lib/quadPostReportReasons";

type QuadPostReport = {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
  reviewedAt: string | null;
  moderatorNote: string | null;
  reporter: { id: string; username: string; display_name: string } | null;
  postOwner: { id: string; username: string; display_name: string } | null;
  post: { id: string; body: string; proof_url: string | null; user_id: string; created_at: string } | null;
};

export function QuadPostModerationCard() {
  const [reports, setReports] = useState<QuadPostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSessionExpired(false);
    setForbidden(false);
    try {
      const data = await fetchAuthed<{ reports: QuadPostReport[] }>(
        "/api/internal/admin/moderation/quad/reports?limit=100",
      );
      setReports(data.reports ?? []);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      if (loadError instanceof ApiRequestError && loadError.status === 403) {
        setForbidden(true);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load post reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function updateReport(reportId: string, status: "reviewing" | "resolved" | "dismissed") {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/quad/reports", { reportId, status });
      const label =
        status === "reviewing" ? "Report marked reviewed." : status === "resolved" ? "Report resolved." : "Report dismissed.";
      setSuccess(label);
      await loadReports();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update report.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePost(postId: string) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/quad/reports?action=delete-post", { postId });
      setSuccess("Post deleted.");
      await loadReports();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete post.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <span aria-hidden>📝</span> Quad Post Reports
          </h3>
          <p className="text-xs text-white/55 mt-1">Review reported feed posts and remove content when needed.</p>
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

      {forbidden ? (
        <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-2">
          <p className="font-semibold">Unable to load moderation reports</p>
          <p className="text-amber-100/80">Your administrator session could not be verified for this queue.</p>
          <button
            type="button"
            onClick={() => void loadReports()}
            className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-[11px] font-semibold text-amber-50 hover:bg-amber-500/20"
          >
            Retry
          </button>
        </div>
      ) : null}
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
        {reports.length === 0 && !loading && !error && !sessionExpired ? (
          <p className="text-sm text-white/60">No post reports in queue.</p>
        ) : null}
        {reports.map((report) => {
          const postPreview = report.post?.body?.trim()
            ? report.post.body.trim().slice(0, 180) + (report.post.body.length > 180 ? "…" : "")
            : report.post?.proof_url
              ? "(Image post)"
              : "(Post unavailable)";
          const postDeleted = !report.post;
          return (
            <article key={report.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                  {new Date(report.createdAt).toLocaleString()} · <span className="uppercase">{report.status}</span>
                </p>
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300/35 text-amber-200">
                  {quadPostReportReasonLabel(report.reason)}
                </span>
              </div>
              <p className="text-sm text-white/90">Post: {postPreview}</p>
              <p className="text-xs text-white/60">
                Reporter: {report.reporter?.display_name ?? "Unknown"} @{report.reporter?.username ?? "unknown"}
              </p>
              <p className="text-xs text-white/60">
                Post owner: {report.postOwner?.display_name ?? "Unknown"} @{report.postOwner?.username ?? "unknown"}
              </p>
              {report.details ? <p className="text-xs text-white/60">Details: {report.details}</p> : null}
              {report.moderatorNote ? <p className="text-xs text-white/45">Moderator note: {report.moderatorNote}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting || report.status === "reviewing" || report.status === "resolved" || report.status === "dismissed"}
                  onClick={() => void updateReport(report.id, "reviewing")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/35 disabled:opacity-50"
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={submitting || report.status === "dismissed"}
                  onClick={() => void updateReport(report.id, "dismissed")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/80 border border-white/20 disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={submitting || postDeleted || !report.post?.id}
                  onClick={() => report.post?.id && void deletePost(report.post.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35 disabled:opacity-50"
                >
                  Delete post
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
