"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminKpiCard, AdminSectionIntro, AdminStatusPill } from "@/components/admin/AdminUi";

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

export function AdminUrinvolvedSection() {
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
        {
          result: {
            success: boolean;
            events_fetched: number;
            events_created: number;
            events_updated: number;
            events_failed: number;
            events_unresolved_location: number;
            events_map_matched: number;
            orgs_created: number;
            orgs_updated: number;
          };
          status: SyncStatus;
        },
        Record<string, never>
      >("/api/internal/admin/urinvolved-sync", {});
      setStatus(data.status);
      const imported = data.result.events_created + data.result.events_updated;
      setMessage(
        data.result.success
          ? `Sync complete — fetched ${data.result.events_fetched}, imported ${imported} (${data.result.events_created} created, ${data.result.events_updated} updated), ${data.result.events_map_matched} map matches, ${data.result.events_unresolved_location} unresolved locations, ${data.result.events_failed} failed.`
          : `Sync finished with errors — fetched ${data.result.events_fetched}, imported ${imported}, ${data.result.events_failed} failed.`,
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

  const nextSyncEstimate = useMemo(() => {
    if (!status?.lastSuccessfulSync) return "After first successful sync";
    const next = new Date(status.lastSuccessfulSync);
    next.setHours(next.getHours() + 24);
    return next.toLocaleString();
  }, [status?.lastSuccessfulSync]);

  const syncSuccessRate = useMemo(() => {
    if (!status?.lastAttemptedSync) return "—";
    return status.lastError ? "Needs review" : "100% recent";
  }, [status?.lastAttemptedSync, status?.lastError]);

  const locationCoverage = useMemo(() => {
    if (!status?.activeEventsCount) return "—";
    const withLocation = status.activeEventsCount - status.eventsMissingLocationCount;
    return `${Math.round((withLocation / status.activeEventsCount) * 100)}%`;
  }, [status]);

  return (
    <div className="space-y-5">
      <AdminSectionIntro
        title="URInvolved Integration"
        description="Sync status, imported content health, and manual sync controls."
      />

      {loading ? <p className="text-sm text-white/50">Loading sync status…</p> : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-200">{message}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusPill label={status?.lastError ? "Sync warning" : "Sync healthy"} tone={status?.lastError ? "warning" : "success"} />
        <AdminStatusPill label={`Success rate: ${syncSuccessRate}`} tone="info" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminKpiCard
          label="Last Sync"
          value={status?.lastSuccessfulSync ? new Date(status.lastSuccessfulSync).toLocaleDateString() : "Never"}
        />
        <AdminKpiCard label="Next Sync (est.)" value={nextSyncEstimate} />
        <AdminKpiCard label="Imported Events" value={status?.activeEventsCount ?? "—"} />
        <AdminKpiCard label="Imported Orgs" value={status?.activeOrganizationsCount ?? "—"} />
        <AdminKpiCard label="With Locations" value={locationCoverage} tone="success" />
        <AdminKpiCard label="Missing Locations" value={status?.eventsMissingLocationCount ?? "—"} tone="warning" />
        <AdminKpiCard label="Map Matches" value={status?.eventsMatchedToMapCount ?? "—"} />
        <AdminKpiCard label="Upcoming Events" value={status?.upcomingActiveEventsCount ?? "—"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void handleRunSync()}
          className="cq-admin-action cq-admin-action--primary disabled:opacity-60"
        >
          {syncing ? "Syncing…" : "Run Sync Now"}
        </button>
        <Link href="/?tab=events" className="cq-admin-action cq-admin-action--default text-center">
          View Imported Events
        </Link>
        <Link href="/?tab=organizations" className="cq-admin-action cq-admin-action--default text-center">
          View Imported Organizations
        </Link>
      </div>

      {syncing ? <p className="text-xs text-white/50">Sync in progress…</p> : null}

      {status?.lastError ? (
        <div className="cq-admin-panel border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
          Last error: {status.lastError}
        </div>
      ) : null}

      <details className="cq-admin-panel group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/80 marker:content-none">
          Detailed sync metrics
        </summary>
        <dl className="grid grid-cols-1 gap-2 border-t border-white/10 p-4 text-xs sm:grid-cols-2">
          <div><dt className="text-white/45">Total rows</dt><dd className="text-white/85">{status?.totalEventsCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Events with venue</dt><dd className="text-white/85">{status?.eventsWithVenueCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Events with address</dt><dd className="text-white/85">{status?.eventsWithAddressCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Matched by address</dt><dd className="text-white/85">{status?.eventsMatchedByAddressCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Matched by venue/name</dt><dd className="text-white/85">{status?.eventsMatchedByVenueOrNameCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Missing location</dt><dd className="text-white/85">{status?.eventsMissingLocationCount ?? 0}</dd></div>
          <div><dt className="text-white/45">On map (has pin)</dt><dd className="text-white/85">{status?.eventsMatchedToMapCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Not on map (no pin)</dt><dd className="text-white/85">{status?.eventsNotOnMapNoPinCount ?? 0}</dd></div>
          <div><dt className="text-white/45">Last attempt</dt><dd className="text-white/85">{status?.lastAttemptedSync ? new Date(status.lastAttemptedSync).toLocaleString() : "Never"}</dd></div>
        </dl>
      </details>
    </div>
  );
}
