import type { MapEventPin } from "@/lib/mapLocationGroups";
import { isEventCancelled } from "@/lib/realm/eventCountdown";

export type LogicalEventFields = {
  title: string;
  startsAt?: string | null;
  start_time?: string | null;
  endsAt?: string | null;
  end_time?: string | null;
  organizationName?: string | null;
  organization_name?: string | null;
  locationName?: string | null;
  location_name?: string | null;
  locationText?: string | null;
  eventUrl?: string | null;
  external_url?: string | null;
  source_url?: string | null;
  cancelled?: boolean;
  status?: string | null;
  tags?: string[] | null;
  sourceExternalId?: string | null;
  external_event_id?: string | null;
  source_event_id?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

export function normalizeEventTitle(title = ""): string {
  return title
    .replace(/\s*\((?:cancelled|canceled)\)\s*/gi, "")
    .replace(/^(?:cancelled|canceled)\s*:\s*/gi, "")
    .trim()
    .toLowerCase();
}

export function extractUrinvolvedEventIdFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const match = url.match(/\/event\/(\d+)/i);
  return match?.[1] ?? null;
}

function fieldStartIso(event: LogicalEventFields): string {
  const raw = event.startsAt ?? event.start_time ?? null;
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function fieldOrganization(event: LogicalEventFields): string {
  return (event.organizationName ?? event.organization_name ?? "").trim().toLowerCase();
}

function fieldLocation(event: LogicalEventFields): string {
  return (event.locationName ?? event.location_name ?? event.locationText ?? "").trim().toLowerCase();
}

function fieldExternalId(event: LogicalEventFields): string | null {
  const direct =
    event.sourceExternalId ??
    event.external_event_id ??
    event.source_event_id ??
    extractUrinvolvedEventIdFromUrl(event.eventUrl) ??
    extractUrinvolvedEventIdFromUrl(event.external_url) ??
    extractUrinvolvedEventIdFromUrl(event.source_url);
  return direct ? String(direct).trim().toLowerCase() : null;
}

function fieldUpdatedAtMs(event: LogicalEventFields): number {
  const raw = event.updatedAt ?? event.updated_at ?? null;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isLogicalEventCancelled(event: LogicalEventFields): boolean {
  if (event.cancelled) return true;
  if (event.status && /cancell?ed/i.test(event.status)) return true;
  if ((event.tags ?? []).some((tag) => /^cancell?ed$/i.test(tag.trim()))) return true;
  return isEventCancelled({ title: event.title, cancelled: event.cancelled });
}

/** Title/org/location/start fingerprint — used when external IDs differ for the same listing. */
export function getLogicalEventFallbackKey(event: LogicalEventFields): string {
  return [
    "fallback",
    normalizeEventTitle(event.title),
    fieldOrganization(event),
    fieldLocation(event),
    fieldStartIso(event),
  ].join("|");
}

export function getLogicalEventKey(event: LogicalEventFields): string {
  const externalId = fieldExternalId(event);
  if (externalId) return `external:${externalId}`;
  return getLogicalEventFallbackKey(event);
}

function pickWinningFields<T extends LogicalEventFields>(a: T, b: T): T {
  const aCancelled = isLogicalEventCancelled(a);
  const bCancelled = isLogicalEventCancelled(b);
  if (aCancelled && !bCancelled) return a;
  if (bCancelled && !aCancelled) return b;

  const aUpdated = fieldUpdatedAtMs(a);
  const bUpdated = fieldUpdatedAtMs(b);
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? a : b;
  return a;
}

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function mergeMapEventPins(winner: MapEventPin, other: MapEventPin): MapEventPin {
  const cancelled = isLogicalEventCancelled(winner) || isLogicalEventCancelled(other);
  const preferUrinvolved = winner.source === "urinvolved" ? winner : other.source === "urinvolved" ? other : winner;

  return {
    ...winner,
    ...other,
    id: preferUrinvolved.id,
    externalEventId: preferUrinvolved.externalEventId ?? winner.externalEventId ?? other.externalEventId,
    sourceExternalId: winner.sourceExternalId ?? other.sourceExternalId ?? null,
    source: preferUrinvolved.source ?? winner.source ?? other.source,
    title: winner.title || other.title,
    startsAt: winner.startsAt || other.startsAt,
    endsAt: winner.endsAt ?? other.endsAt ?? null,
    organizationName: winner.organizationName ?? other.organizationName ?? null,
    eventUrl: winner.eventUrl ?? other.eventUrl ?? null,
    imageUrl: winner.imageUrl ?? other.imageUrl ?? null,
    category: winner.category ?? other.category ?? null,
    locationText: winner.locationText ?? other.locationText ?? null,
    placementStatus: winner.placementStatus ?? other.placementStatus ?? null,
    matchConfidence: winner.matchConfidence ?? other.matchConfidence ?? null,
    matchReason: winner.matchReason ?? other.matchReason ?? null,
    needsReview: winner.needsReview || other.needsReview,
    locationManuallyAdjusted: winner.locationManuallyAdjusted || other.locationManuallyAdjusted,
    updatedAt: laterIso(winner.updatedAt, other.updatedAt),
    cancelled,
  };
}

export function dedupeLogicalMapEvents(events: MapEventPin[]): MapEventPin[] {
  const byKey = new Map<string, MapEventPin>();

  for (const event of events) {
    const key = getLogicalEventKey(event);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    const winner = pickWinningFields(existing, event);
    const loser = winner === existing ? event : existing;
    byKey.set(key, mergeMapEventPins(winner, loser));
  }

  return Array.from(byKey.values());
}

export function dedupeLogicalEventFields<T extends LogicalEventFields>(events: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const event of events) {
    const key = getLogicalEventKey(event);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    byKey.set(key, pickWinningFields(existing, event));
  }

  return Array.from(byKey.values());
}
