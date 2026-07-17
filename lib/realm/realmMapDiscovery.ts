/**
 * First-open Realm discovery: nearest opportunity, nearby counts, live spotlight,
 * and walking-ETA labels. Pure helpers — no Google Maps / React timers here.
 */

import type { GroupedMapLocation, MapEventPin, MapQuestPin, MapQrPin } from "@/lib/mapLocationGroups";
import { getLogicalEventKey, isLogicalEventCancelled } from "@/lib/realm/dedupeLogicalEvents";
import { isEventCancelled, getEventCountdownState } from "@/lib/realm/eventCountdown";
import { effectiveEventEndIso, isEventVisibleOnMap } from "@/lib/realm/eventVisibility";
import { distanceMeters } from "@/lib/realm/realmFirstOpen";
import type { RealmLocationId } from "@/lib/realm/locations";

/** Default “around you” radius — 1 mile. */
export const DISCOVERY_NEARBY_RADIUS_M = 1609.34;

/** Average walking speed used for first-open ETA (no Directions API call). */
export const DISCOVERY_WALKING_SPEED_MPS = 1.4;

export const DISCOVERY_BANNER_MS = 4000;
export const DISCOVERY_SPOTLIGHT_MS = 5000;
export const DISCOVERY_COUNTDOWN_TICK_MS = 60_000;

export type DiscoveryOpportunityKind = "event" | "quest" | "qr";

export type DiscoveryOpportunity = {
  /** Marker id (landmark slug or supplementary groupKey). */
  markerId: string;
  kind: DiscoveryOpportunityKind;
  lat: number;
  lng: number;
  title: string;
  /** Stable dedupe key across sync duplicates. */
  dedupeKey: string;
  event?: MapEventPin;
};

export type DiscoveryLandmarkLike = {
  id: RealmLocationId | string;
  mapContent?: GroupedMapLocation | null;
  activeQuests?: number;
  upcomingEvents?: number;
};

export function isValidDiscoveryCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Estimated walking minutes from straight-line meters (no routing). */
export function estimateWalkingMinutes(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return distanceM / DISCOVERY_WALKING_SPEED_MPS / 60;
}

/**
 * Natural walking-away copy.
 * Under one minute → "Less than 1 min away"
 */
export function formatWalkingAwayLabel(distanceM: number, knownDurationSeconds?: number | null): string {
  const minutes =
    knownDurationSeconds != null && Number.isFinite(knownDurationSeconds)
      ? Math.max(0, knownDurationSeconds / 60)
      : estimateWalkingMinutes(distanceM);
  if (minutes < 1) return "Less than 1 min away";
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} min away`;
}

export function formatOpportunitiesBannerCopy(count: number): string {
  if (count <= 0) return "No nearby opportunities yet";
  if (count === 1) return "1 opportunity around you";
  return `${count} opportunities around you`;
}

function questDedupeKey(quest: MapQuestPin): string {
  return `quest:${quest.id}`;
}

function qrDedupeKey(qr: MapQrPin): string {
  return `qr:${qr.adminQuestId ?? qr.id}`;
}

function eventDedupeKey(event: MapEventPin): string {
  return `event:${getLogicalEventKey({
    title: event.title,
    startsAt: event.startsAt,
    organizationName: event.organizationName,
    locationText: event.locationText,
    sourceExternalId: event.sourceExternalId,
    eventUrl: event.eventUrl,
    updatedAt: event.updatedAt,
  })}`;
}

function isActiveQuest(quest: MapQuestPin, now: Date): boolean {
  if (!quest.id) return false;
  if (!quest.expiresAt) return true;
  const exp = Date.parse(quest.expiresAt);
  return Number.isFinite(exp) && exp > now.getTime();
}

function isActiveQr(qr: MapQrPin, now: Date): boolean {
  if (!qr.id || !qr.scanPath) return false;
  if (!qr.expiresAt) return true;
  const exp = Date.parse(qr.expiresAt);
  return Number.isFinite(exp) && exp > now.getTime();
}

function isActiveEvent(event: MapEventPin, now: Date): boolean {
  if (isEventCancelled(event) || isLogicalEventCancelled({ title: event.title, tags: event.cancelled ? ["cancelled"] : null })) {
    return false;
  }
  return isEventVisibleOnMap({ end_time: effectiveEventEndIso(event.startsAt, event.endsAt) }, now);
}

/**
 * Flatten landmark + supplementary activity into unique opportunities with coords.
 * Duplicate synced events collapse to one record (latest status wins via prior dedupe).
 */
export function collectDiscoveryOpportunities(args: {
  landmarks: DiscoveryLandmarkLike[];
  geoPositions: Record<string, { lat: number; lng: number }>;
  supplementaryPins: GroupedMapLocation[];
  now?: Date;
}): DiscoveryOpportunity[] {
  const now = args.now ?? new Date();
  const byKey = new Map<string, DiscoveryOpportunity>();

  const push = (opp: DiscoveryOpportunity) => {
    if (!isValidDiscoveryCoordinate(opp.lat, opp.lng)) return;
    const existing = byKey.get(opp.dedupeKey);
    if (!existing) {
      byKey.set(opp.dedupeKey, opp);
      return;
    }
    // Prefer non-cancelled / later-updated event when keys collide.
    if (opp.kind === "event" && opp.event && existing.event) {
      const a = Date.parse(opp.event.updatedAt ?? opp.event.startsAt);
      const b = Date.parse(existing.event.updatedAt ?? existing.event.startsAt);
      if (Number.isFinite(a) && (!Number.isFinite(b) || a >= b)) {
        byKey.set(opp.dedupeKey, opp);
      }
    }
  };

  for (const landmark of args.landmarks) {
    const pos = args.geoPositions[landmark.id];
    if (!pos || !isValidDiscoveryCoordinate(pos.lat, pos.lng)) continue;
    const content = landmark.mapContent;
    for (const quest of content?.quests ?? []) {
      if (!isActiveQuest(quest, now)) continue;
      push({
        markerId: String(landmark.id),
        kind: "quest",
        lat: pos.lat,
        lng: pos.lng,
        title: quest.name,
        dedupeKey: questDedupeKey(quest),
      });
    }
    for (const qr of content?.qrCodes ?? []) {
      if (!isActiveQr(qr, now)) continue;
      push({
        markerId: String(landmark.id),
        kind: "qr",
        lat: pos.lat,
        lng: pos.lng,
        title: qr.name,
        dedupeKey: qrDedupeKey(qr),
      });
    }
    for (const event of content?.events ?? []) {
      if (!isActiveEvent(event, now)) continue;
      push({
        markerId: String(landmark.id),
        kind: "event",
        lat: pos.lat,
        lng: pos.lng,
        title: event.title,
        dedupeKey: eventDedupeKey(event),
        event,
      });
    }
  }

  for (const group of args.supplementaryPins) {
    if (!isValidDiscoveryCoordinate(group.lat, group.lng)) continue;
    const lat = group.lat!;
    const lng = group.lng!;
    for (const quest of group.quests ?? []) {
      if (!isActiveQuest(quest, now)) continue;
      push({
        markerId: group.groupKey,
        kind: "quest",
        lat,
        lng,
        title: quest.name,
        dedupeKey: questDedupeKey(quest),
      });
    }
    for (const qr of group.qrCodes ?? []) {
      if (!isActiveQr(qr, now)) continue;
      push({
        markerId: group.groupKey,
        kind: "qr",
        lat,
        lng,
        title: qr.name,
        dedupeKey: qrDedupeKey(qr),
      });
    }
    for (const event of group.events ?? []) {
      if (!isActiveEvent(event, now)) continue;
      push({
        markerId: group.groupKey,
        kind: "event",
        lat,
        lng,
        title: event.title,
        dedupeKey: eventDedupeKey(event),
        event,
      });
    }
  }

  return Array.from(byKey.values());
}

export function selectNearestOpportunity(
  opportunities: DiscoveryOpportunity[],
  origin: { lat: number; lng: number },
): { opportunity: DiscoveryOpportunity; distanceM: number } | null {
  if (!isValidDiscoveryCoordinate(origin.lat, origin.lng)) return null;
  let best: { opportunity: DiscoveryOpportunity; distanceM: number } | null = null;
  for (const opportunity of opportunities) {
    const distanceM = distanceMeters(origin, { lat: opportunity.lat, lng: opportunity.lng });
    if (!best || distanceM < best.distanceM) {
      best = { opportunity, distanceM };
    }
  }
  return best;
}

export function countNearbyOpportunities(
  opportunities: DiscoveryOpportunity[],
  origin: { lat: number; lng: number },
  radiusM = DISCOVERY_NEARBY_RADIUS_M,
): number {
  if (!isValidDiscoveryCoordinate(origin.lat, origin.lng)) return 0;
  let count = 0;
  for (const opportunity of opportunities) {
    if (distanceMeters(origin, { lat: opportunity.lat, lng: opportunity.lng }) <= radiusM) {
      count += 1;
    }
  }
  return count;
}

export type LiveSpotlightSelection = {
  opportunity: DiscoveryOpportunity;
  distanceM: number;
  label: string;
  kind: "live" | "soon";
};

/**
 * Nearest live event, else the soonest starting within 60 minutes.
 * Tie-break: shortest distance from the user.
 */
export function selectLiveEventSpotlight(
  opportunities: DiscoveryOpportunity[],
  origin: { lat: number; lng: number },
  now: Date = new Date(),
): LiveSpotlightSelection | null {
  if (!isValidDiscoveryCoordinate(origin.lat, origin.lng)) return null;

  const eventOpps = opportunities.filter((o) => o.kind === "event" && o.event);
  if (eventOpps.length === 0) return null;

  type Scored = {
    opportunity: DiscoveryOpportunity;
    distanceM: number;
    priority: number;
    startMs: number;
    label: string;
    kind: "live" | "soon";
  };

  const scored: Scored[] = [];
  for (const opportunity of eventOpps) {
    const event = opportunity.event!;
    if (!isActiveEvent(event, now)) continue;
    const state = getEventCountdownState(event.startsAt, event.endsAt, now, false);
    if (state.kind === "ended" || state.kind === "cancelled") continue;

    const distanceM = distanceMeters(origin, { lat: opportunity.lat, lng: opportunity.lng });
    const startMs = Date.parse(event.startsAt);
    if (!Number.isFinite(startMs)) continue;

    if (state.kind === "live") {
      scored.push({
        opportunity,
        distanceM,
        priority: 0,
        startMs,
        label: "Live now",
        kind: "live",
      });
      continue;
    }

    const minutesUntil = Math.ceil((startMs - now.getTime()) / 60_000);
    if (minutesUntil > 0 && minutesUntil <= 60) {
      scored.push({
        opportunity,
        distanceM,
        priority: 1,
        startMs,
        label: `Starts in ${minutesUntil} min`,
        kind: "soon",
      });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.priority === 1 && a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.distanceM - b.distanceM;
  });

  const top = scored[0]!;
  return {
    opportunity: top.opportunity,
    distanceM: top.distanceM,
    label: top.label,
    kind: top.kind,
  };
}

/** Refresh spotlight countdown label for a known event. */
export function refreshSpotlightLabel(event: MapEventPin, now: Date = new Date()): string | null {
  if (!isActiveEvent(event, now)) return null;
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, false);
  if (state.kind === "ended" || state.kind === "cancelled") return null;
  if (state.kind === "live") return "Live now";
  const startMs = Date.parse(event.startsAt);
  if (!Number.isFinite(startMs)) return null;
  const minutesUntil = Math.ceil((startMs - now.getTime()) / 60_000);
  if (minutesUntil <= 0) return "Live now";
  if (minutesUntil > 60) return null;
  return `Starts in ${minutesUntil} min`;
}
