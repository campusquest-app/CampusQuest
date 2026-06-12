"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

type SyncStatus = {
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  totalEventsCount: number;
  activeEventsCount: number;
  upcomingActiveEventsCount: number;
  activeOrganizationsCount: number;
  eventsWithVenueCount: number;
  eventsWithAddressCount: number;
  eventsMissingLocationCount: number;
  eventsMatchedToMapCount: number;
  eventsMatchedByAddressCount: number;
  eventsMatchedByVenueOrNameCount: number;
  eventsNotOnMapNoPinCount: number;
  lastError: string | null;
};

export function URInvolvedSyncAdminCard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ status: SyncStatus }>("/api/internal/admin/urinvolved-sync");
      setStatus(data.status);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load URInvolved sync status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleRunSync() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const data = await postAuthed<
        { result: { success: boolean; events_created: number; events_updated: number; orgs_created: number; orgs_updated: number }; status: SyncStatus },
        Record<string, never>
      >("/api/internal/admin/urinvolved-sync", {});
      setStatus(data.status);
      setMessage(
        data.result.success
          ? `Sync complete — ${data.result.events_created} events created, ${data.result.events_updated} updated, ${data.result.orgs_created} orgs created, ${data.result.orgs_updated} updated.`
          : "Sync finished with errors. See last error below.",
      );
    } catch (syncError) {
      if (syncError instanceof ApiRequestError && syncError.status === 403) {
        setError("You do not have permission to run URInvolved sync.");
      } else {
        setError(syncError instanceof Error ? syncError.message : "Sync failed.");
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">URInvolved sync</h2>
        <p className="text-xs text-white/55 mt-1">
          Imports URI events (RSS) and organizations (public API) into Supabase every 24 hours. CampusQuest displays cached data only.
        </p>
      </div>

      {loading ? <p className="text-sm text-white/50">Loading sync status…</p> : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-200">{message}</p> : null}

      {status ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Last successful sync</dt>
            <dd className="text-white/85 mt-0.5">
              {status.lastSuccessfulSync ? new Date(status.lastSuccessfulSync).toLocaleString() : "Never"}
            </dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Last sync attempt</dt>
            <dd className="text-white/85 mt-0.5">
              {status.lastAttemptedSync ? new Date(status.lastAttemptedSync).toLocaleString() : "Never"}
            </dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Total external_events rows</dt>
            <dd className="text-white/85 mt-0.5">{status.totalEventsCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Active external_events rows</dt>
            <dd className="text-white/85 mt-0.5">{status.activeEventsCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Upcoming active events</dt>
            <dd className="text-white/85 mt-0.5">{status.upcomingActiveEventsCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Active imported organizations</dt>
            <dd className="text-white/85 mt-0.5">{status.activeOrganizationsCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Imported events with venue</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsWithVenueCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Imported events with address</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsWithAddressCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Imported events missing location</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsMissingLocationCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Imported events matched to map</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsMatchedToMapCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Matched by address</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsMatchedByAddressCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Matched by venue/name</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsMatchedByVenueOrNameCount}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className="text-white/45">Not on map (no pin)</dt>
            <dd className="text-white/85 mt-0.5">{status.eventsNotOnMapNoPinCount}</dd>
          </div>
        </dl>
      ) : null}

      {status?.lastError ? (
        <p className="text-xs text-amber-200/90 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2">
          Last error: {status.lastError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleRunSync()}
        disabled={syncing}
        className="rounded-lg bg-uri-keaney text-uri-navy text-sm font-semibold px-4 py-2.5 disabled:opacity-60"
      >
        {syncing ? "Syncing…" : "Run Sync Now"}
      </button>
    </section>
  );
}
