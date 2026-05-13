"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type Appeal = {
  id: string;
  userId: string;
  message: string;
  status: "pending" | "reviewed" | "denied" | "approved";
  moderatorNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

export function AppealsModerationCard() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ appeals: Appeal[] }>("/api/internal/admin/moderation/appeals?limit=100");
      setAppeals(data.appeals ?? []);
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
      const message = loadError instanceof Error ? loadError.message : "Could not load appeals.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppeals();
  }, [loadAppeals]);

  async function reviewAppeal(appealId: string, status: "approved" | "denied") {
    const moderatorNote = window.prompt(`Optional note for ${status}:`, "") ?? "";
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await postAuthed("/api/internal/admin/moderation/appeals", {
        appealId,
        status,
        moderatorNote: moderatorNote.trim() || undefined,
      });
      setSuccess(status === "approved" ? "Appeal approved and user reactivated." : "Appeal denied.");
      await loadAppeals();
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : "Could not review appeal.";
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
            <span aria-hidden>📮</span> Appeals Dashboard
          </h3>
          <p className="text-xs text-white/55 mt-1">Review suspended/banned student appeals.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAppeals()}
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

      <div className="space-y-3 max-h-[26rem] overflow-y-auto">
        {appeals.length === 0 && !loading && !error && !sessionExpired ? <p className="text-sm text-white/60">No appeals in queue.</p> : null}
        {appeals.map((appeal) => (
          <article key={appeal.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
            <p className="text-xs text-white/50">
              {new Date(appeal.createdAt).toLocaleString()} · <span className="uppercase">{appeal.status}</span>
            </p>
            <p className="text-xs text-white/75">
              {appeal.user?.displayName ?? "Unknown"} @{appeal.user?.username ?? "unknown"}
            </p>
            <p className="text-sm text-white/90">{appeal.message}</p>
            {appeal.moderatorNote ? <p className="text-xs text-white/60">Note: {appeal.moderatorNote}</p> : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={submitting || appeal.status === "approved"}
                onClick={() => void reviewAppeal(appeal.id, "approved")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 disabled:opacity-50"
              >
                Approve (Reactivate)
              </button>
              <button
                type="button"
                disabled={submitting || appeal.status === "denied"}
                onClick={() => void reviewAppeal(appeal.id, "denied")}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/35 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
