"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchUrinvolvedMapPlacements,
  resetUrinvolvedPlacement,
  saveUrinvolvedPlacement,
  type UrinvolvedPlacementEvent,
  type UrinvolvedPlacementsResponse,
} from "@/lib/client/urinvolvedMapPlacementsClient";

function formatEventTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "manually_adjusted":
      return "Manually adjusted";
    case "auto_matched":
      return "Auto matched";
    case "hidden":
      return "Hidden";
    case "ignored":
      return "Ignored";
    case "unmatched":
      return "Unmatched";
    default:
      return "Runtime auto";
  }
}

function EventPlacementEditor({
  event,
  catalog,
  saving,
  onSave,
  onHide,
  onIgnore,
  onReset,
  onClose,
}: {
  event: UrinvolvedPlacementEvent;
  catalog: UrinvolvedPlacementsResponse["catalog"];
  saving: boolean;
  onSave: (realmLocationId: string) => void;
  onHide: () => void;
  onIgnore: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [selectedSlug, setSelectedSlug] = useState(
    event.override?.realmLocationId ??
      (event.currentMatch?.kind === "realm"
        ? (event.currentMatch.realmLocationId ?? "")
        : (event.suggestedMatches[0]?.realmLocationId ?? "")),
  );

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white">{event.title}</p>
          <p className="text-[10px] text-white/55">{formatEventTime(event.startsAt)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] text-white/50 hover:text-white/80">
          Close
        </button>
      </div>

      <dl className="space-y-1 text-[10px] text-white/75">
        <div>
          <dt className="text-white/45">Source</dt>
          <dd>URInvolved</dd>
        </div>
        <div>
          <dt className="text-white/45">Raw location</dt>
          <dd className="break-words">{event.rawLocationText}</dd>
        </div>
        <div>
          <dt className="text-white/45">Auto match</dt>
          <dd>
            {event.autoMatch
              ? `${event.autoMatch.matchReason} (${Math.round(event.autoMatch.confidence * 100)}%)`
              : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-white/45">Status</dt>
          <dd>{statusLabel(event.override?.matchStatus)}</dd>
        </div>
      </dl>

      <label className="block text-[10px] font-semibold text-white/70">
        Assign map location
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white"
        >
          <option value="">Select location…</option>
          {catalog.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>

      {event.suggestedMatches.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {event.suggestedMatches.map((s) => (
            <button
              key={s.realmLocationId}
              type="button"
              onClick={() => setSelectedSlug(s.realmLocationId)}
              className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-cyan-100/90 hover:bg-white/10"
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!selectedSlug || saving}
          onClick={() => onSave(selectedSlug)}
          className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save placement"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onReset}
          className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] text-white/75"
        >
          Reset auto-match
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onHide}
          className="rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-[10px] text-rose-100/90"
        >
          Hide
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onIgnore}
          className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] text-white/65"
        >
          Ignore for now
        </button>
      </div>
    </div>
  );
}

export function RealmUrinvolvedPlacementPanel({
  active,
  selectedExternalEventId,
  onSelectExternalEventId,
  onPlacementsChanged,
  selectedLandmarkRealmId = null,
}: {
  active: boolean;
  selectedExternalEventId?: string | null;
  onSelectExternalEventId?: (id: string | null) => void;
  onPlacementsChanged?: () => void;
  selectedLandmarkRealmId?: string | null;
}) {
  const [data, setData] = useState<UrinvolvedPlacementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchUrinvolvedMapPlacements();
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load URInvolved placements.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void reload();
  }, [active, reload]);

  const selectedEvent =
    data?.events.find((e) => e.externalEventId === selectedExternalEventId) ??
    data?.unmatched.find((e) => e.externalEventId === selectedExternalEventId) ??
    null;

  const handleSave = async (externalEventId: string, realmLocationId: string) => {
    setSaving(true);
    try {
      await saveUrinvolvedPlacement({ externalEventId, realmLocationId, matchStatus: "manually_adjusted" });
      await reload();
      onPlacementsChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (
    externalEventId: string,
    matchStatus: "hidden" | "ignored",
  ) => {
    setSaving(true);
    try {
      await saveUrinvolvedPlacement({ externalEventId, matchStatus });
      await reload();
      onPlacementsChanged?.();
      onSelectExternalEventId?.(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (externalEventId: string) => {
    setSaving(true);
    try {
      await resetUrinvolvedPlacement(externalEventId);
      await reload();
      onPlacementsChanged?.();
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-violet-400/25 bg-violet-500/10 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-200/90">
          Unmatched URInvolved Events
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="text-[10px] text-white/50 hover:text-white/80"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-[10px] text-white/50">Loading placements…</p> : null}
      {error ? <p className="text-[10px] text-rose-200/90">{error}</p> : null}

      {data ? (
        <p className="text-[10px] text-white/55">
          {data.unmatched.length} unmatched · {data.needsReview.length} need review · {data.events.length} today
        </p>
      ) : null}

      {selectedLandmarkRealmId && data ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] font-semibold text-white/80">URInvolved at this pin</p>
          <ul className="mt-1 space-y-1">
            {data.events
              .filter(
                (event) =>
                  event.currentMatch?.kind === "realm" &&
                  event.currentMatch.realmLocationId === selectedLandmarkRealmId,
              )
              .map((event) => (
                <li key={event.externalEventId}>
                  <button
                    type="button"
                    onClick={() => onSelectExternalEventId?.(event.externalEventId)}
                    className="w-full rounded border border-white/10 px-2 py-1 text-left text-[10px] text-white/80 hover:bg-white/5"
                  >
                    <span className="font-medium text-white/90">{event.title}</span>
                    <span className="block text-white/50">{statusLabel(event.override?.matchStatus)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {selectedEvent ? (
        <EventPlacementEditor
          event={selectedEvent}
          catalog={data?.catalog ?? []}
          saving={saving}
          onSave={(slug) => void handleSave(selectedEvent.externalEventId, slug)}
          onHide={() => void handleStatus(selectedEvent.externalEventId, "hidden")}
          onIgnore={() => void handleStatus(selectedEvent.externalEventId, "ignored")}
          onReset={() => void handleReset(selectedEvent.externalEventId)}
          onClose={() => onSelectExternalEventId?.(null)}
        />
      ) : null}

      <ul className="max-h-36 space-y-1 overflow-y-auto overscroll-contain">
        {(data?.unmatched ?? []).map((event) => (
          <li
            key={event.externalEventId}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white/80"
          >
            <p className="font-medium text-white/90">{event.title}</p>
            <p className="text-white/50">{formatEventTime(event.startsAt)}</p>
            <p className="mt-0.5 break-words text-white/65">{event.rawLocationText}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onSelectExternalEventId?.(event.externalEventId)}
                className="rounded border border-uri-keaney/40 px-2 py-0.5 text-[10px] text-cyan-100"
              >
                Assign Location
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatus(event.externalEventId, "hidden")}
                className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70"
              >
                Hide
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStatus(event.externalEventId, "ignored")}
                className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/60"
              >
                Ignore for now
              </button>
            </div>
          </li>
        ))}
        {!loading && (data?.unmatched.length ?? 0) === 0 ? (
          <li className="text-[10px] text-white/45">All today&apos;s URInvolved events are placed.</li>
        ) : null}
      </ul>
    </div>
  );
}
