"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminKpiCard, AdminSectionIntro, AdminStatusPill } from "@/components/admin/AdminUi";
import { AdminUrinvolvedSection } from "@/components/admin/AdminUrinvolvedSection";

type SourceStatus = {
  source: string;
  label: string;
  configured: boolean;
  configurationHint: string;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastStatus: string | null;
  lastError: string | null;
  eventsReceived: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicatesMerged: number;
  activeEventsCount: number;
};

export function AdminEventSourcesSection() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState("");
  const [manualVenue, setManualVenue] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ sources: SourceStatus[] }>("/api/internal/admin/event-sources");
      setSources(data.sources ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load event sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSync(source: string) {
    setSyncing(source);
    setMessage(null);
    setError(null);
    try {
      const data = await postAuthed<{ result: { success: boolean; skipped?: boolean; skipReason?: string | null; eventsReceived: number; eventsCreated: number; eventsUpdated: number }; sources: SourceStatus[] }, { source: string }>(
        "/api/internal/admin/event-sources/sync",
        { source },
      );
      setSources(data.sources ?? []);
      if (data.result.skipped) {
        setMessage(`${source}: not configured (${data.result.skipReason ?? "feed_not_configured"}).`);
      } else {
        setMessage(
          `${source}: ${data.result.success ? "synced" : "finished with errors"} — received ${data.result.eventsReceived}, created ${data.result.eventsCreated}, updated ${data.result.eventsUpdated}.`,
        );
      }
    } catch (syncError) {
      if (syncError instanceof ApiRequestError && syncError.status === 403) {
        setError("You do not have permission to run event source sync.");
      } else {
        setError(syncError instanceof Error ? syncError.message : "Sync failed.");
      }
    } finally {
      setSyncing(null);
    }
  }

  async function createManualEvent() {
    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      await postAuthed("/api/internal/admin/manual-events", {
        title: manualTitle,
        startsAt: new Date(manualStartsAt).toISOString(),
        venueName: manualVenue || undefined,
        description: manualDescription || undefined,
      });
      setManualTitle("");
      setManualStartsAt("");
      setManualVenue("");
      setManualDescription("");
      setMessage("Verified CampusQuest event created.");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create event.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <AdminSectionIntro
        title="Event sources"
        description="URInvolved remains the club-event provider. Athletics and other campus calendars normalize into the same Events, Realm, search, and For You experience. Sync never overwrites admin overrides."
      />
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="text-sm text-cyan-200/90">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {loading && sources.length === 0 ? <p className="text-sm text-white/55">Loading sources…</p> : null}
        {sources.map((source) => (
          <article key={source.source} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{source.label}</h3>
                <p className="mt-1 text-[11px] text-white/45">{source.source}</p>
              </div>
              <AdminStatusPill
                tone={source.lastStatus === "failed" ? "danger" : source.configured ? "success" : "neutral"}
                label={source.configured ? source.lastStatus ?? "ready" : "not connected"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AdminKpiCard label="Active events" value={String(source.activeEventsCount)} />
              <AdminKpiCard label="Last received" value={String(source.eventsReceived)} />
            </div>
            <p className="text-xs text-white/50">{source.configurationHint}</p>
            {source.lastError ? <p className="text-xs text-rose-200/90">{source.lastError}</p> : null}
            {source.lastSuccessfulSync ? (
              <p className="text-[11px] text-white/40">Last success {new Date(source.lastSuccessfulSync).toLocaleString()}</p>
            ) : null}
            <button
              type="button"
              disabled={syncing === source.source}
              onClick={() => void runSync(source.source)}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
            >
              {syncing === source.source ? "Syncing…" : `Run ${source.label} sync`}
            </button>
          </article>
        ))}
      </div>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <h3 className="font-semibold text-white">Create verified manual event</h3>
        <p className="text-xs text-white/50">
          Stored as source <code>manual</code> with admin override so later provider syncs will not overwrite it.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            placeholder="Title"
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
          />
          <input
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            type="datetime-local"
            value={manualStartsAt}
            onChange={(event) => setManualStartsAt(event.target.value)}
          />
          <input
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2"
            placeholder="Venue (Ryan Center, Memorial Union, …)"
            value={manualVenue}
            onChange={(event) => setManualVenue(event.target.value)}
          />
          <textarea
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2"
            placeholder="Description (optional)"
            rows={3}
            value={manualDescription}
            onChange={(event) => setManualDescription(event.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={creating || manualTitle.trim().length < 3 || !manualStartsAt}
          onClick={() => void createManualEvent()}
          className="rounded-lg border border-uri-keaney/40 px-3 py-2 text-xs font-semibold text-uri-keaney hover:bg-uri-keaney/10 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create verified event"}
        </button>
      </section>

      <AdminUrinvolvedSection />
    </div>
  );
}
