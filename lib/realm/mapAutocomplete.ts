import type { GroupedMapLocation, MapEventPin, MapQuestPin } from "@/lib/mapLocationGroups";
import {
  effectiveEventEndIso,
  isEventVisibleOnMap,
} from "@/lib/realm/eventVisibility";
import { isEventCancelled } from "@/lib/realm/eventCountdown";
import { isLogicalEventCancelled } from "@/lib/realm/dedupeLogicalEvents";

export const MAP_SEARCH_DEBOUNCE_MS = 200;
export const MAP_SEARCH_RESULT_LIMIT = 8;

export type MapSearchResultKind = "building" | "event" | "club" | "quest";

export type MapSearchResult = {
  id: string;
  kind: MapSearchResultKind;
  title: string;
  subtitle: string;
  /** Stable dedupe key across sources. */
  dedupeKey: string;
  lat?: number;
  lng?: number;
  /** Landmark / group marker to open. */
  markerId?: string;
  groupKey?: string;
  realmLocationId?: string | null;
  organizationId?: string;
  organizationSource?: "internal" | "external";
  /** Ranking score — higher is better. */
  score: number;
};

export type MapSearchBuildingSource = {
  id: string;
  name: string;
  shortLabel?: string;
  address?: string | null;
  lat: number;
  lng: number;
};

export type MapSearchClubSource = {
  id: string;
  name: string;
  category?: string | null;
  source: "internal" | "external";
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isActiveQuest(quest: MapQuestPin, now: Date): boolean {
  if (!quest.id) return false;
  if (!quest.expiresAt) return true;
  const exp = Date.parse(quest.expiresAt);
  return Number.isFinite(exp) && exp > now.getTime();
}

function isActiveUpcomingEvent(event: MapEventPin, now: Date): boolean {
  if (
    isEventCancelled(event) ||
    isLogicalEventCancelled({ title: event.title, tags: event.cancelled ? ["cancelled"] : null })
  ) {
    return false;
  }
  return isEventVisibleOnMap({ end_time: effectiveEventEndIso(event.startsAt, event.endsAt) }, now);
}

function formatEventWhen(startsAt: string, now: Date = new Date()): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Upcoming event";
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  if (sameDay) return `Today · ${time}`;
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  return `${day} · ${time}`;
}

/**
 * Score a candidate against the query. Exact > prefix > word-prefix > includes.
 */
export function scoreMapSearchMatch(query: string, ...fields: Array<string | null | undefined>): number {
  const q = normalize(query);
  if (!q) return 0;

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const value = normalize(field);
    if (!value) continue;

    if (value === q) best = Math.max(best, 100);
    else if (value.startsWith(q)) best = Math.max(best, 85);
    else {
      const words = value.split(" ");
      if (words.some((word) => word.startsWith(q))) best = Math.max(best, 70);
      else if (value.includes(q)) best = Math.max(best, 45);
    }
  }
  return best;
}

export function buildMapSearchCatalog(args: {
  buildings: MapSearchBuildingSource[];
  groups: GroupedMapLocation[];
  clubs?: MapSearchClubSource[];
  now?: Date;
}): Omit<MapSearchResult, "score">[] {
  const now = args.now ?? new Date();
  const items: Omit<MapSearchResult, "score">[] = [];
  const seen = new Set<string>();

  const push = (item: Omit<MapSearchResult, "score">) => {
    if (seen.has(item.dedupeKey)) return;
    seen.add(item.dedupeKey);
    items.push(item);
  };

  for (const building of args.buildings) {
    if (!Number.isFinite(building.lat) || !Number.isFinite(building.lng)) continue;
    push({
      id: building.id,
      kind: "building",
      title: building.name,
      subtitle: building.address?.trim() || building.shortLabel || "Campus location",
      dedupeKey: `building:${building.id}`,
      lat: building.lat,
      lng: building.lng,
      markerId: building.id,
      realmLocationId: building.id,
    });
  }

  for (const group of args.groups) {
    const hasCoords = group.lat != null && group.lng != null;
    const markerId = group.realmLocationId ?? group.groupKey;

    if (!group.attachToLandmark && hasCoords) {
      push({
        id: group.groupKey,
        kind: "building",
        title: group.locationName,
        subtitle: group.locationAddress?.trim() || "Campus location",
        dedupeKey: `building:${group.groupKey}`,
        lat: group.lat!,
        lng: group.lng!,
        markerId: group.groupKey,
        groupKey: group.groupKey,
        realmLocationId: group.realmLocationId,
      });
    }

    for (const event of group.events) {
      if (!isActiveUpcomingEvent(event, now)) continue;
      if (!hasCoords) continue;
      const org = event.organizationName?.trim();
      push({
        id: event.id,
        kind: "event",
        title: event.title,
        subtitle: [formatEventWhen(event.startsAt, now), org || group.locationName]
          .filter(Boolean)
          .join(" · "),
        dedupeKey: `event:${event.externalEventId ?? event.sourceExternalId ?? event.id}`,
        lat: group.lat!,
        lng: group.lng!,
        markerId,
        groupKey: group.groupKey,
        realmLocationId: group.realmLocationId,
      });
    }

    for (const quest of group.quests) {
      if (!isActiveQuest(quest, now)) continue;
      if (!hasCoords) continue;
      push({
        id: quest.id,
        kind: "quest",
        title: quest.name,
        subtitle: `${quest.xpReward} XP · ${group.locationName}`,
        dedupeKey: `quest:${quest.id}`,
        lat: group.lat!,
        lng: group.lng!,
        markerId,
        groupKey: group.groupKey,
        realmLocationId: group.realmLocationId,
      });
    }
  }

  for (const club of args.clubs ?? []) {
    push({
      id: club.id,
      kind: "club",
      title: club.name,
      subtitle: club.category?.trim() || "Campus club",
      dedupeKey: `club:${club.source}:${club.id}`,
      organizationId: club.id,
      organizationSource: club.source,
    });
  }

  return items;
}

export function searchMapCatalog(
  catalog: Omit<MapSearchResult, "score">[],
  query: string,
  limit = MAP_SEARCH_RESULT_LIMIT,
): MapSearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const kindBoost: Record<MapSearchResultKind, number> = {
    building: 8,
    event: 6,
    quest: 5,
    club: 4,
  };

  const scored = catalog
    .map((item) => {
      const score = scoreMapSearchMatch(q, item.title, item.subtitle);
      if (score <= 0) return null;
      return { ...item, score: score + kindBoost[item.kind] };
    })
    .filter((item): item is MapSearchResult => item != null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    });

  return scored.slice(0, limit);
}

export function mapSearchKindLabel(kind: MapSearchResultKind): string {
  switch (kind) {
    case "building":
      return "Building";
    case "event":
      return "Event";
    case "club":
      return "Club";
    case "quest":
      return "Quest";
  }
}
