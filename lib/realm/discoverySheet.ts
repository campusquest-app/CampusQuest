import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { distanceMeters, REALM_HEART_OF_CAMPUS } from "@/lib/realm/realmFirstOpen";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

export type DiscoverySheetSnap = "collapsed" | "default" | "expanded";

export type DiscoverySheetSnaps = Record<DiscoverySheetSnap, number>;

export type AthleticsHighlight = {
  id: string;
  title: string;
  sport: string;
  timeLabel: string | null;
  imageUrl: string | null;
  broadcastUrl: string | null;
};

export type NearbyPlaceCard = {
  id: string;
  markerId: string;
  name: string;
  categoryLabel: string;
  imageUrl: string;
  walkMinutes: number;
  lat: number;
  lng: number;
};

const WALK_METERS_PER_MINUTE = 80;
const SAVED_PLACES_KEY = "cq_realm_saved_places_v1";

const PLACE_IMAGES: Record<string, string> = {
  library: "/quad-feed/library.jpg",
  "memorial-union": "/quad-feed/memorial-union.png",
  "rec-center": "/icons/locations/rec-center.png",
  "engineering-hall": "/icons/locations/engineering-hall.png",
  "the-quad": "/icons/locations/the-quad.png",
  "butterfield-dining": "/quad-feed/coffee.jpg",
  "mainfare-dining": "/quad-feed/coffee.jpg",
  "business-building": "/quad-feed/career.jpg",
  "rams-den": "/icons/locations/rams-den.png",
  "fine-arts": "/quad-feed/concert.jpg",
};

const PLACE_CATEGORY_LABEL: Record<string, string> = {
  library: "Study • Resources",
  "engineering-hall": "Academics",
  "business-building": "Academics",
  "butterfield-dining": "Food • Community",
  "mainfare-dining": "Food • Community",
  "rec-center": "Fitness",
  "memorial-union": "Community",
  "the-quad": "Campus",
  "rams-den": "Food • Community",
  "fine-arts": "Arts",
};

export function discoverySheetSnaps(viewportHeight: number, topReservePx = 96): DiscoverySheetSnaps {
  const h = Math.max(480, viewportHeight);
  const maxH = Math.max(160, h - topReservePx);
  return {
    collapsed: clamp(Math.round(h * 0.12), 72, 110),
    default: clamp(Math.round(h * 0.52), 280, maxH),
    expanded: clamp(Math.round(h * 0.86), 360, maxH),
  };
}

export function nearestDiscoverySnap(height: number, snaps: DiscoverySheetSnaps): DiscoverySheetSnap {
  const entries: DiscoverySheetSnap[] = ["collapsed", "default", "expanded"];
  let best: DiscoverySheetSnap = "default";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const key of entries) {
    const dist = Math.abs(height - snaps[key]);
    if (dist < bestDist) {
      best = key;
      bestDist = dist;
    }
  }
  return best;
}

export function snapFromVelocity(
  height: number,
  velocityPxPerMs: number,
  snaps: DiscoverySheetSnaps,
): DiscoverySheetSnap {
  const nearest = nearestDiscoverySnap(height, snaps);
  if (Math.abs(velocityPxPerMs) < 0.45) return nearest;
  if (velocityPxPerMs > 0) {
    if (nearest === "collapsed") return "default";
    return "expanded";
  }
  if (nearest === "expanded") return "default";
  return "collapsed";
}

export function cycleDiscoverySnap(current: DiscoverySheetSnap): DiscoverySheetSnap {
  if (current === "collapsed") return "default";
  if (current === "default") return "expanded";
  return "default";
}

export function walkingMinutesFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters < 0) return 1;
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}

export function walkingMinutesBetween(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number },
): number {
  const origin = from && Number.isFinite(from.lat) && Number.isFinite(from.lng) ? from : REALM_HEART_OF_CAMPUS;
  return walkingMinutesFromMeters(distanceMeters(origin, to));
}

export function placeCardImage(markerId: string, fallback?: string | null): string {
  return PLACE_IMAGES[markerId] ?? fallback ?? "/maps/uri-campus-map.png";
}

export function placeCategoryLabel(markerId: string, category?: string | null): string {
  if (PLACE_CATEGORY_LABEL[markerId]) return PLACE_CATEGORY_LABEL[markerId];
  const trimmed = category?.trim();
  if (trimmed) return trimmed.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return "Campus place";
}

export type NearbyPlaceSource = {
  id: string;
  name: string;
  category?: string | null;
  major?: boolean;
  lat: number;
  lng: number;
};

export function buildNearbyPlaceCards(
  items: MapRecommendationItem[],
  origin: { lat: number; lng: number } | null,
  limit = 6,
): NearbyPlaceCard[] {
  const places = items.filter((item) => item.kind === "place");
  return places.slice(0, limit).map((item) => ({
    id: item.id,
    markerId: item.markerId,
    name: item.title,
    categoryLabel: placeCategoryLabel(item.markerId),
    imageUrl: placeCardImage(item.markerId),
    walkMinutes: walkingMinutesBetween(origin, { lat: item.lat, lng: item.lng }),
    lat: item.lat,
    lng: item.lng,
  }));
}

/** Nearby campus cards from real landmarks so the carousel is not starved by event ranking. */
export function buildNearbyPlaceCardsFromLandmarks(
  landmarks: NearbyPlaceSource[],
  origin: { lat: number; lng: number } | null,
  limit = 6,
): NearbyPlaceCard[] {
  const usable = landmarks.filter(
    (landmark) => Number.isFinite(landmark.lat) && Number.isFinite(landmark.lng) && (landmark.lat !== 0 || landmark.lng !== 0),
  );
  const scored = usable.map((landmark) => ({
    ...landmark,
    walkMinutes: walkingMinutesBetween(origin, { lat: landmark.lat, lng: landmark.lng }),
  }));
  scored.sort((a, b) => {
    if (Boolean(a.major) !== Boolean(b.major)) return a.major ? -1 : 1;
    return a.walkMinutes - b.walkMinutes;
  });
  return scored.slice(0, limit).map((landmark) => ({
    id: `place:${landmark.id}`,
    markerId: landmark.id,
    name: landmark.name,
    categoryLabel: placeCategoryLabel(landmark.id, landmark.category),
    imageUrl: placeCardImage(landmark.id),
    walkMinutes: landmark.walkMinutes,
    lat: landmark.lat,
    lng: landmark.lng,
  }));
}

export function collectAthleticsHighlights(
  groups: Array<Pick<GroupedMapLocation, "events">>,
  now = new Date(),
  limit = 3,
): AthleticsHighlight[] {
  const nowMs = now.getTime();
  const rows: AthleticsHighlight[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const event of group.events ?? []) {
      if (!isAthleticsEvent(event)) continue;
      const start = Date.parse(event.startsAt);
      if (Number.isFinite(start) && start + 3 * 60 * 60 * 1000 < nowMs) continue;
      const id = event.externalEventId ?? event.sourceExternalId ?? event.id;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        title: event.title,
        sport: (event.sport ?? event.category ?? "Athletics").trim() || "Athletics",
        timeLabel: eventTimeShort(event.startsAt, now),
        imageUrl: event.imageUrl ?? null,
        broadcastUrl: event.broadcastUrl ?? null,
      });
    }
  }
  rows.sort((a, b) => a.title.localeCompare(b.title));
  return rows.slice(0, limit);
}

export function readSavedPlaceIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function toggleSavedPlaceId(id: string): Set<string> {
  const next = readSavedPlaceIds();
  if (next.has(id)) next.delete(id);
  else next.add(id);
  try {
    window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(Array.from(next)));
  } catch {
    /* ignore */
  }
  return next;
}

function isAthleticsEvent(event: MapEventPin): boolean {
  const source = (event.source ?? "").toLowerCase();
  if (source === "athletics") return true;
  if (event.sport?.trim()) return true;
  const category = (event.category ?? "").toLowerCase();
  return category === "athletics";
}

function eventTimeShort(startsAt: string, now: Date): string | null {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
