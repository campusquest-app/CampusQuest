"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { AdminKpiCard, AdminSectionIntro, AdminStatusPill } from "@/components/admin/AdminUi";
import { AdminUrinvolvedSection } from "@/components/admin/AdminUrinvolvedSection";
import { formatAdminSyncErrorSummary, repairPhaseLabel } from "@/lib/eventSources/providerHealth";

type SourceStatus = {
  source: string;
  label: string;
  configured: boolean;
  configurationHint: string;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  nextScheduledSync: string | null;
  lastStatus: string | null;
  lastError: string | null;
  eventsReceived: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicatesMerged: number;
  activeEventsCount: number;
  healthStatus: string;
  healthLabel: string;
  healthMessage: string;
  operatorHealthLabel?: "Healthy" | "Failed" | "Repairing" | "Manual Review";
  repairPhase?: string | null;
  schemaCompatible?: boolean;
  watchdogStatus?: string | null;
  currentEventCount?: number;
  lastGoodEventCount?: number;
  consecutiveFailures?: number;
  latestIncident?: IncidentCard | null;
};

type IncidentCard = {
  id: string;
  provider: string;
  incident_type: string;
  error_code: string | null;
  error_message: string | null;
  technical_details: string | null;
  detected_at: string;
  status: string;
  repair_action: string | null;
  deployment_commit: string | null;
  inventory_before: Record<string, unknown>;
  inventory_after: Record<string, unknown>;
};

type SchemaHealth = {
  ok: boolean;
  code: string | null;
  message: string;
};

type WatchdogPayload = {
  overall: "HEALTHY" | "DEGRADED";
  athleticsOnlyFailure?: boolean;
  athleticsOnlyReason?: string | null;
  recovery: {
    source: string | null;
    autoRecoveryOccurred: boolean;
    retryAttempts: number;
    finalResult: string;
  };
};

function healthTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "connected":
    case "Healthy":
      return "success";
    case "syncing":
    case "Repairing":
      return "info";
    case "warning":
    case "stale":
    case "configuration_required":
    case "Manual Review":
      return "warning";
    case "failed":
    case "Failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function AdminEventSourcesSection() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [schemaHealth, setSchemaHealth] = useState<SchemaHealth | null>(null);
  const [watchdog, setWatchdog] = useState<WatchdogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTech, setExpandedTech] = useState<Record<string, boolean>>({});
  const [manualTitle, setManualTitle] = useState("");
  const [manualStartsAt, setManualStartsAt] = useState("");
  const [manualVenue, setManualVenue] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [healthResyncing, setHealthResyncing] = useState(false);
  const [incidents, setIncidents] = useState<IncidentCard[]>([]);
  const [repairingSource, setRepairingSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{
        sources: SourceStatus[];
        schemaHealth?: SchemaHealth;
        watchdog?: WatchdogPayload;
        incidents?: IncidentCard[];
      }>("/api/internal/admin/event-sources");
      setSources(data.sources ?? []);
      setSchemaHealth(data.schemaHealth ?? null);
      setWatchdog(data.watchdog ?? null);
      setIncidents(data.incidents ?? []);
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
      const data = await postAuthed<
        {
          result: {
            success: boolean;
            skipped?: boolean;
            skipReason?: string | null;
            eventsReceived: number;
            eventsCreated: number;
            eventsUpdated: number;
          };
          sources: SourceStatus[];
          schemaHealth?: SchemaHealth;
          watchdog?: WatchdogPayload;
          incidents?: IncidentCard[];
        },
        { source: string }
      >("/api/internal/admin/event-sources/sync", { source });
      setSources(data.sources ?? []);
      if (data.schemaHealth) setSchemaHealth(data.schemaHealth);
      if (data.watchdog) setWatchdog(data.watchdog);
      if (data.incidents) setIncidents(data.incidents);
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

  async function runSafeUrinvolvedResync() {
    setHealthResyncing(true);
    setMessage(null);
    setError(null);
    try {
      const data = await postAuthed<
        {
          result: { success: boolean; events_fetched?: number; events_created?: number; events_updated?: number };
          watchdog?: WatchdogPayload;
          sources?: SourceStatus[];
        },
        { action: "resync"; source: "urinvolved" }
      >("/api/internal/admin/event-health", { action: "resync", source: "urinvolved" });
      if (data.sources) setSources(data.sources);
      if (data.watchdog) setWatchdog(data.watchdog);
      setMessage(
        data.result.success
          ? "Safe URInvolved resync published a healthy catalog."
          : "Safe URInvolved resync kept last-known-good inventory (catalog was not published).",
      );
    } catch (resyncError) {
      if (resyncError instanceof ApiRequestError && resyncError.status === 403) {
        setError("You do not have permission to run a safe URInvolved resync.");
      } else {
        setError(resyncError instanceof Error ? resyncError.message : "Safe resync failed.");
      }
    } finally {
      setHealthResyncing(false);
    }
  }

  async function runProviderRepair(source: "urinvolved" | "athletics") {
    setRepairingSource(source);
    setMessage(null);
    setError(null);
    try {
      const data = await postAuthed<
        {
          recovery: { status: string; repairAction: string | null };
          sources?: SourceStatus[];
          schemaHealth?: SchemaHealth;
          watchdog?: WatchdogPayload;
          incidents?: IncidentCard[];
        },
        { source: "urinvolved" | "athletics" }
      >("/api/internal/admin/provider-repair", { source });
      if (data.sources) setSources(data.sources);
      if (data.schemaHealth) setSchemaHealth(data.schemaHealth);
      if (data.watchdog) setWatchdog(data.watchdog);
      if (data.incidents) setIncidents(data.incidents);
      setMessage(`${source}: repair ${data.recovery.status}${data.recovery.repairAction ? ` (${data.recovery.repairAction})` : ""}.`);
    } catch (repairError) {
      if (repairError instanceof ApiRequestError && repairError.status === 403) {
        setError("You do not have permission to run provider repair.");
      } else {
        setError(repairError instanceof Error ? repairError.message : "Repair failed.");
      }
    } finally {
      setRepairingSource(null);
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
      {watchdog ? (
        <div
          className={`rounded-xl border px-4 py-3 space-y-2 ${
            watchdog.overall === "DEGRADED"
              ? "border-amber-400/40 bg-amber-500/10"
              : "border-emerald-400/30 bg-emerald-500/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              Overall Events: {watchdog.overall}
            </p>
            <button
              type="button"
              disabled={healthResyncing}
              onClick={() => void runSafeUrinvolvedResync()}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
            >
              {healthResyncing ? "Resyncing…" : "Safe URInvolved resync"}
            </button>
          </div>
          {watchdog.athleticsOnlyFailure ? (
            <p className="text-xs text-amber-100/90">
              {watchdog.athleticsOnlyReason ||
                "Athletics inventory is populated while URInvolved looks empty. Last-known-good campus events are retained."}
            </p>
          ) : null}
          <p className="text-[11px] text-white/55">
            Recovery: {watchdog.recovery.autoRecoveryOccurred ? "auto-recovery ran" : "not needed"}
            {watchdog.recovery.retryAttempts > 0
              ? ` · ${watchdog.recovery.retryAttempts} retry attempt(s)`
              : ""}
            {` · ${watchdog.recovery.finalResult}`}
          </p>
        </div>
      ) : null}
      {schemaHealth && !schemaHealth.ok ? (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-rose-100">EVENT_SCHEMA_INCOMPATIBLE</p>
          <p className="text-xs text-rose-100/85">
            {schemaHealth.message ||
              "external_events requires UNIQUE(source, external_id). Apply migration 20260905190000_external_events_identity_invariant, then retry sync once."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {loading && sources.length === 0 ? <p className="text-sm text-white/55">Loading sources…</p> : null}
        {sources.map((source) => {
          const operatorLabel =
            syncing === source.source || repairingSource === source.source
              ? "Repairing"
              : source.operatorHealthLabel ?? source.healthLabel;
          const phase =
            repairingSource === source.source
              ? "Applying safe repair…"
              : source.repairPhase ?? repairPhaseLabel(source.latestIncident?.status);
          const errorSummary =
            source.healthStatus === "failed" || source.lastError
              ? formatAdminSyncErrorSummary(source.lastError)
              : null;
          return (
            <article key={source.source} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{source.label}</h3>
                  <p className="mt-1 text-[11px] text-white/45">{source.source}</p>
                </div>
                <AdminStatusPill tone={healthTone(operatorLabel)} label={operatorLabel} />
              </div>
              {phase ? <p className="text-xs font-medium text-cyan-100/90">{phase}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <AdminKpiCard label="Active events" value={String(source.activeEventsCount)} />
                <AdminKpiCard label="Last received" value={String(source.eventsReceived)} />
                {source.lastGoodEventCount != null ? (
                  <AdminKpiCard label="Last-known-good" value={String(source.lastGoodEventCount)} />
                ) : null}
                {source.currentEventCount != null ? (
                  <AdminKpiCard label="Upcoming" value={String(source.currentEventCount)} />
                ) : null}
              </div>
              {source.watchdogStatus && source.watchdogStatus !== "healthy" ? (
                <p className="text-[11px] text-amber-100/80">Watchdog: {source.watchdogStatus}</p>
              ) : null}
              <p className="text-xs text-white/60">{source.healthMessage}</p>
              <p className="text-xs text-white/45">{source.configurationHint}</p>
              <div className="space-y-1 text-[11px] text-white/40">
                <p>
                  Last success:{" "}
                  {source.lastSuccessfulSync ? new Date(source.lastSuccessfulSync).toLocaleString() : "Never"}
                </p>
                <p>
                  Last attempt:{" "}
                  {source.lastAttemptedSync ? new Date(source.lastAttemptedSync).toLocaleString() : "Never"}
                </p>
                <p>
                  Next scheduled:{" "}
                  {source.nextScheduledSync
                    ? new Date(source.nextScheduledSync).toLocaleString()
                    : "Not scheduled"}
                </p>
              </div>
              {errorSummary?.technical ? (
                <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-rose-100">{errorSummary.title}</p>
                  <p className="text-[11px] text-rose-100/80">{errorSummary.summary}</p>
                  <button
                    type="button"
                    className="text-[11px] text-rose-200/90 underline"
                    onClick={() =>
                      setExpandedTech((prev) => ({ ...prev, [source.source]: !prev[source.source] }))
                    }
                  >
                    {expandedTech[source.source] ? "Hide technical details" : "View technical details"}
                  </button>
                  {expandedTech[source.source] ? (
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[10px] text-rose-100/70">
                      {errorSummary.technical}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={syncing === source.source}
                  onClick={() => void runSync(source.source)}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
                >
                  {syncing === source.source ? "Syncing…" : `Retry Sync`}
                </button>
                {source.source === "urinvolved" || source.source === "athletics" ? (
                  <button
                    type="button"
                    disabled={repairingSource === source.source}
                    onClick={() => void runProviderRepair(source.source as "urinvolved" | "athletics")}
                    className="rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
                  >
                    {repairingSource === source.source ? "Repairing…" : "Run safe repair"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {incidents.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <h3 className="font-semibold text-white">Production incidents</h3>
          {incidents.slice(0, 8).map((incident) => (
            <article key={incident.id} className="rounded-lg border border-white/10 px-3 py-2 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {incident.provider} · {incident.error_code ?? incident.incident_type}
                </p>
                <span className="text-[11px] text-white/50">{incident.status}</span>
              </div>
              <p className="text-xs text-white/70">{incident.error_message ?? "No summary."}</p>
              <p className="text-[11px] text-white/45">
                Repair: {incident.repair_action ?? "none"}
                {incident.deployment_commit ? ` · Commit: ${incident.deployment_commit}` : ""}
              </p>
              <p className="text-[11px] text-white/40">
                Events before: {String(incident.inventory_before.urinvolved ?? "n/a")} · after:{" "}
                {String(incident.inventory_after.urinvolved ?? "n/a")} · Athletics after:{" "}
                {String(incident.inventory_after.athletics ?? incident.inventory_before.athletics ?? "n/a")}
              </p>
              <p className="text-[11px] text-white/35">{new Date(incident.detected_at).toLocaleString()}</p>
              {incident.technical_details ? (
                <div>
                  <button
                    type="button"
                    className="text-[11px] text-white/60 underline"
                    onClick={() =>
                      setExpandedTech((prev) => ({ ...prev, [incident.id]: !prev[incident.id] }))
                    }
                  >
                    {expandedTech[incident.id] ? "Hide technical details" : "View technical details"}
                  </button>
                  {expandedTech[incident.id] ? (
                    <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[10px] text-white/45">
                      {incident.technical_details}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

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
