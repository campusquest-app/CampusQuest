"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed } from "@/lib/client/dashboardApi";

type Analytics = {
  totalUsers: number;
  verifiedUsers: number;
  eventsCreated: number;
  eventRsvps: number;
  organizationsCreated: number;
  messagesSent: number;
  reportsSubmitted: number;
  dailyActiveUsers: number;
  generatedAt: string;
};

export function PilotAnalyticsCard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const data = await fetchAuthed<{ analytics: Analytics }>("/api/internal/admin/pilot-analytics");
      setAnalytics(data.analytics ?? null);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setSessionExpired(true);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-white flex items-center gap-2">
            <span aria-hidden>📈</span> Pilot Analytics
          </h3>
          <p className="text-xs text-white/55 mt-1">Live pilot-level metrics for growth, engagement, and safety.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-uri-keaney/40 text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error ? <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {sessionExpired ? (
        <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Session expired. Please sign in again to access analytics.
        </div>
      ) : null}
      {analytics ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Total users" value={analytics.totalUsers} />
            <Metric label="Verified users" value={analytics.verifiedUsers} />
            <Metric label="Events created" value={analytics.eventsCreated} />
            <Metric label="RSVPs" value={analytics.eventRsvps} />
            <Metric label="Organizations" value={analytics.organizationsCreated} />
            <Metric label="Messages sent" value={analytics.messagesSent} />
            <Metric label="Reports submitted" value={analytics.reportsSubmitted} />
            <Metric label="Daily active users" value={analytics.dailyActiveUsers} />
          </div>
          <p className="text-[11px] text-white/40">Updated {new Date(analytics.generatedAt).toLocaleString()}</p>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[11px] text-white/55">{label}</p>
      <p className="text-lg font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
