import type { GroupedMapLocation, MapEventPin, MapQuestPin } from "@/lib/mapLocationGroups";
import {
  campusEventToRecommendationEntity,
  externalEventToRecommendationEntity,
  locationToRecommendationEntity,
  mapEventPinToRecommendationEntity,
  rankRecommendationEntities,
  scoreRecommendationEntity,
  type RecommendationEntity,
  type UserRecommendationProfile,
} from "@/lib/recommendations";
import { formatCampusTime, getEventCountdownState, isEventCancelled, isOnCampusDay } from "@/lib/realm/eventCountdown";
import { hasUsableMapCoords } from "@/lib/realm/mapCoords";
import { isEventVisibleOnMap, effectiveEventEndIso } from "@/lib/realm/eventVisibility";

export type MapRecommendationKind = "event" | "place" | "quest";

export type MapRecommendationSource = {
  id: string;
  kind: MapRecommendationKind;
  markerId: string;
  lat: number;
  lng: number;
  locationName: string;
  event?: MapEventPin;
  quest?: MapQuestPin;
  place?: { id: string; name: string; category?: string | null; major?: boolean };
};

export type MapRecommendationItem = {
  id: string;
  kind: MapRecommendationKind;
  title: string;
  locationName: string;
  timeLabel: string | null;
  reasonLabel: string | null;
  score: number;
  markerId: string;
  lat: number;
  lng: number;
  eventId: string | null;
  questId: string | null;
  relatedQuestName: string | null;
  happeningToday: boolean;
  live: boolean;
  campusRsvp: boolean;
};

export type MapRecommendationLandmark = {
  id: string;
  name: string;
  category?: string | null;
  major: boolean;
  lat: number;
  lng: number;
  mapContent: GroupedMapLocation | null;
};

/** Strongest 5–8 cards; narrower viewports get fewer pins. */
export function forYouRecommendationLimit(viewportWidth = 390): number {
  if (viewportWidth < 400) return 5;
  if (viewportWidth < 720) return 6;
  return 8;
}

function eventDedupeKey(event: MapEventPin): string {
  return `event:${event.externalEventId ?? event.sourceExternalId ?? event.id}`;
}

function isActiveQuest(quest: MapQuestPin, now: Date): boolean {
  if (!quest.id) return false;
  if (!quest.expiresAt) return true;
  const exp = Date.parse(quest.expiresAt);
  return Number.isFinite(exp) && exp > now.getTime();
}

function eventTimeLabel(event: MapEventPin, now: Date): string {
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, isEventCancelled(event));
  if (state.kind === "live") return state.label;
  if (state.kind === "ended" || state.kind === "cancelled") return state.label;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return "Upcoming";
  const time = formatCampusTime(start);
  return isOnCampusDay(start, now) ? `Today · ${time}` : time;
}

export function collectMapRecommendationSources(args: {
  landmarks: MapRecommendationLandmark[];
  groups: GroupedMapLocation[];
  now: Date;
}): MapRecommendationSource[] {
  const out: MapRecommendationSource[] = [];
  const seenEvents = new Set<string>();
  const seenQuests = new Set<string>();
  const seenPlaces = new Set<string>();

  const considerGroup = (group: GroupedMapLocation, markerId: string, lat: number, lng: number) => {
    if (!hasUsableMapCoords(lat, lng)) return;

    for (const event of group.events) {
      if (isEventCancelled(event)) continue;
      if (!isEventVisibleOnMap({ end_time: effectiveEventEndIso(event.startsAt, event.endsAt) }, args.now)) continue;
      const key = eventDedupeKey(event);
      if (seenEvents.has(key)) continue;
      seenEvents.add(key);
      out.push({
        id: key,
        kind: "event",
        markerId,
        lat,
        lng,
        locationName: group.locationName,
        event,
      });
    }

    for (const quest of group.quests) {
      if (!isActiveQuest(quest, args.now)) continue;
      if (seenQuests.has(quest.id)) continue;
      seenQuests.add(quest.id);
      out.push({
        id: `quest:${quest.id}`,
        kind: "quest",
        markerId,
        lat,
        lng,
        locationName: group.locationName,
        quest,
      });
    }
  };

  for (const landmark of args.landmarks) {
    if (!hasUsableMapCoords(landmark.lat, landmark.lng)) continue;
    if (!seenPlaces.has(landmark.id)) {
      seenPlaces.add(landmark.id);
      out.push({
        id: `place:${landmark.id}`,
        kind: "place",
        markerId: landmark.id,
        lat: landmark.lat,
        lng: landmark.lng,
        locationName: landmark.name,
        place: {
          id: landmark.id,
          name: landmark.name,
          category: landmark.category ?? null,
          major: landmark.major,
        },
      });
    }
    if (landmark.mapContent) {
      considerGroup(landmark.mapContent, landmark.id, landmark.lat, landmark.lng);
    }
  }

  for (const group of args.groups) {
    if (!hasUsableMapCoords(group.lat, group.lng)) continue;
    considerGroup(group, group.groupKey, group.lat as number, group.lng as number);
  }

  return out;
}

function sourceToEntity(source: MapRecommendationSource): RecommendationEntity {
  if (source.kind === "event" && source.event) {
    return mapEventPinToRecommendationEntity(source.event, source.locationName);
  }
  if (source.kind === "quest" && source.quest) {
    return {
      id: source.quest.id,
      kind: "quest",
      title: source.quest.name,
      description: source.quest.description,
      locationName: source.locationName,
      campusId: "uri",
      endsAtMs: source.quest.expiresAt ? Date.parse(source.quest.expiresAt) : null,
    };
  }
  const place = source.place;
  return locationToRecommendationEntity({
    id: place?.id ?? source.markerId,
    name: place?.name ?? source.locationName,
    category: place?.category,
    major: place?.major,
  });
}

function relatedQuestName(source: MapRecommendationSource, all: MapRecommendationSource[]): string | null {
  if (source.kind !== "event") return null;
  const quest = all.find((row) => row.kind === "quest" && row.markerId === source.markerId);
  return quest?.quest?.name ?? null;
}

export function rankMapRecommendations(args: {
  landmarks: MapRecommendationLandmark[];
  groups: GroupedMapLocation[];
  profile: UserRecommendationProfile;
  now: Date;
  limit?: number;
}): MapRecommendationItem[] {
  const sources = collectMapRecommendationSources(args);
  const nowMs = args.now.getTime();
  const ranked = rankRecommendationEntities({
    items: sources,
    toEntity: sourceToEntity,
    profile: args.profile,
    nowMs,
    diversity: true,
    exploreEvery: 4,
  });

  const picked: MapRecommendationItem[] = [];
  const usedMarkers = new Set<string>();
  const limit = args.limit ?? forYouRecommendationLimit();

  // Shared scores stay comparable to Events For You; map density prefers spatial events.
  const kindRank = (kind: MapRecommendationKind) => (kind === "event" ? 0 : kind === "quest" ? 1 : 2);
  const ordered = [...ranked].sort((a, b) => {
    const kindDiff = kindRank(a.item.kind) - kindRank(b.item.kind);
    if (kindDiff !== 0) return kindDiff;
    if (b.recommendation.score !== a.recommendation.score) return b.recommendation.score - a.recommendation.score;
    return 0;
  });

  for (const row of ordered) {
    if (picked.length >= limit) break;
    const source = row.item;
    // One card per marker keeps For You from stacking duplicate pins.
    if (usedMarkers.has(source.markerId) && source.kind !== "event") continue;
    if (source.kind === "event" && usedMarkers.has(source.markerId)) {
      // Allow a second event at the same place only when we still have budget and scores are strong.
      const sameMarkerEvents = picked.filter((item) => item.markerId === source.markerId && item.kind === "event");
      if (sameMarkerEvents.length >= 1) continue;
    }

    const event = source.event;
    const live =
      event != null && getEventCountdownState(event.startsAt, event.endsAt, args.now, isEventCancelled(event)).kind === "live";
    const happeningToday =
      live || (event != null && !Number.isNaN(Date.parse(event.startsAt)) && isOnCampusDay(new Date(event.startsAt), args.now));

    picked.push({
      id: source.id,
      kind: source.kind,
      title: event?.title ?? source.quest?.name ?? source.place?.name ?? source.locationName,
      locationName: source.locationName,
      timeLabel: event ? eventTimeLabel(event, args.now) : source.kind === "quest" ? "Quest available" : "Campus place",
      reasonLabel: row.recommendation.reason?.label ?? null,
      score: row.recommendation.score,
      markerId: source.markerId,
      lat: source.lat,
      lng: source.lng,
      eventId: event?.id ?? null,
      questId: source.quest?.id ?? null,
      relatedQuestName: relatedQuestName(source, sources),
      happeningToday,
      live,
      campusRsvp: Boolean(event && (event.cqRsvpEnabled || !event.source)),
    });
    usedMarkers.add(source.markerId);
  }

  return picked;
}

export function mapRecommendationCounts(items: MapRecommendationItem[]): {
  events: number;
  places: number;
  live: number;
} {
  return {
    events: items.filter((item) => item.kind === "event").length,
    places: items.filter((item) => item.kind === "place").length,
    live: items.filter((item) => item.live).length,
  };
}

export function recommendedMarkerIds(items: MapRecommendationItem[]): Set<string> {
  return new Set(items.map((item) => item.markerId));
}

export function recommendationScoreBySearchId(items: MapRecommendationItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    out[item.markerId] = Math.max(out[item.markerId] ?? 0, item.score);
    if (item.eventId) out[item.eventId] = Math.max(out[item.eventId] ?? 0, item.score);
    if (item.questId) out[item.questId] = Math.max(out[item.questId] ?? 0, item.score);
  }
  return out;
}

/** Shared with Events For You: score a campus/external event entity. */
export function scoreMapEventLikeCampusEvent(
  event: Parameters<typeof campusEventToRecommendationEntity>[0],
  profile: UserRecommendationProfile,
  nowMs: number,
) {
  return scoreRecommendationEntity(campusEventToRecommendationEntity(event), profile, nowMs);
}

export function scoreMapEventLikeExternalEvent(
  event: Parameters<typeof externalEventToRecommendationEntity>[0],
  profile: UserRecommendationProfile,
  nowMs: number,
) {
  return scoreRecommendationEntity(externalEventToRecommendationEntity(event), profile, nowMs);
}

export function findMapFocusForEvent(
  eventId: string,
  sources: MapRecommendationSource[],
): MapRecommendationSource | null {
  const needle = eventId.trim().toLowerCase();
  if (!needle) return null;
  return (
    sources.find((row) => {
      if (row.kind !== "event" || !row.event) return false;
      const ids = [row.event.id, row.event.externalEventId, row.event.sourceExternalId];
      return ids.some((id) => id && id.toLowerCase() === needle);
    }) ?? null
  );
}

export function findMapFocusForLocation(
  locationId: string,
  landmarks: MapRecommendationLandmark[],
  groups: GroupedMapLocation[],
): { markerId: string; lat: number; lng: number } | null {
  const needle = locationId.trim().toLowerCase();
  if (!needle) return null;
  const landmark = landmarks.find((row) => row.id.toLowerCase() === needle);
  if (landmark && hasUsableMapCoords(landmark.lat, landmark.lng)) {
    return { markerId: landmark.id, lat: landmark.lat, lng: landmark.lng };
  }
  const group = groups.find(
    (row) =>
      row.groupKey.toLowerCase() === needle ||
      (row.realmLocationId && row.realmLocationId.toLowerCase() === needle),
  );
  if (group && hasUsableMapCoords(group.lat, group.lng)) {
    return { markerId: group.groupKey, lat: group.lat as number, lng: group.lng as number };
  }
  return null;
}
