import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { distanceMeters } from "@/lib/realm/realmFirstOpen";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";
import {
  placeCardImage,
  placeCardImageAlt,
  placeCardImageObjectPosition,
} from "@/lib/realm/placeImages";
import {
  RHODY_YOUTUBE_HIGHLIGHTS,
  youtubeThumbnailFallbackUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type RhodyYoutubeHighlightSource,
} from "@/lib/realm/rhodyYoutubeHighlights";

export { placeCardImage, placeCardImageAlt, placeCardImageObjectPosition };

export type DiscoverySheetSnap = "collapsed" | "default" | "expanded";

export type DiscoverySheetSnaps = Record<DiscoverySheetSnap, number> & {
  defaultMax: number;
};

export type WalkTimeStatus = "ready" | "locating" | "unavailable";

export type AthleticsHighlight = {
  id: string;
  type: "athletics" | "youtube" | "placeholder";
  title: string;
  sport: string;
  opponent: string | null;
  timeLabel: string | null;
  durationLabel: string | null;
  imageUrl: string | null;
  /** hqdefault (or similar) when primary YouTube maxres thumbnail fails. */
  imageFallbackUrl: string | null;
  broadcastUrl: string | null;
  youtubeVideoId: string | null;
  /** Preferred external open URL (YouTube watch link, broadcast, etc.). */
  url: string | null;
  playable: boolean;
};

export type NearbyPlaceCard = {
  id: string;
  markerId: string;
  name: string;
  categoryLabel: string;
  imageUrl: string;
  imageAlt: string;
  imageObjectPosition: string;
  walkMinutes: number | null;
  lat: number;
  lng: number;
};

export type WalkOrigin = {
  lat: number;
  lng: number;
  accuracy?: number | null;
};

const WALK_METERS_PER_MINUTE = 80;
/** Kingston core only — a ~5km GPS fix must not produce campus walk ETAs. */
const CAMPUS_WALK_LAT_MIN = 41.482;
const CAMPUS_WALK_LAT_MAX = 41.492;
const CAMPUS_WALK_LNG_MIN = -71.536;
const CAMPUS_WALK_LNG_MAX = -71.524;
const MAX_CAMPUS_WALK_METERS = 1600;
const MAX_CAMPUS_WALK_MINUTES = 18;
const SAVED_PLACES_KEY = "cq_realm_saved_places_v1";

const ATHLETICS_FALLBACK_IMAGES = [
  "/quad-feed/womens-basketball.jpg",
  "/quad-feed/gym.jpg",
  "/quad-feed/running.jpg",
] as const;

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

export function discoverySheetSnaps(
  viewportHeight: number,
  topReservePx = 120,
  navClearancePx = 88,
  contentHeightPx?: number,
): DiscoverySheetSnaps {
  const h = Math.max(480, viewportHeight);
  const usable = Math.max(360, h - Math.max(0, navClearancePx));
  const maxH = Math.max(200, usable - Math.max(96, topReservePx));
  const collapsed = clamp(Math.round(usable * 0.1), 64, 88);
  const defaultMax = clamp(Math.round(usable * 0.34), 220, maxH);
  const contentCap = clamp(Math.round(usable * 0.4), defaultMax, maxH);
  const defaultH =
    contentHeightPx != null && Number.isFinite(contentHeightPx)
      ? clamp(Math.round(contentHeightPx), collapsed + 72, contentCap)
      : defaultMax;
  return {
    collapsed,
    default: defaultH,
    defaultMax,
    expanded: clamp(Math.round(usable * 0.86), defaultH + 40, maxH),
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

/** Kingston campus bbox — reject off-campus / swapped / coarse GPS for walk ETAs. */
export function isCampusWalkOrigin(origin: WalkOrigin | null | undefined): origin is WalkOrigin {
  if (!origin) return false;
  const { lat, lng, accuracy } = origin;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 60 || Math.abs(lng) < 20) return false;
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > 350) return false;
  return (
    lat >= CAMPUS_WALK_LAT_MIN &&
    lat <= CAMPUS_WALK_LAT_MAX &&
    lng >= CAMPUS_WALK_LNG_MIN &&
    lng <= CAMPUS_WALK_LNG_MAX
  );
}

export function walkingMinutesBetween(
  from: WalkOrigin | null,
  to: { lat: number; lng: number },
): number | null {
  if (!isCampusWalkOrigin(from)) return null;
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return null;
  const meters = distanceMeters(from, to);
  if (meters > MAX_CAMPUS_WALK_METERS) return null;
  const minutes = walkingMinutesFromMeters(meters);
  if (minutes > MAX_CAMPUS_WALK_MINUTES) return null;
  return minutes;
}

export function campusWalkTimeStatus(
  origin: WalkOrigin | null | undefined,
  locating: boolean,
): WalkTimeStatus {
  if (isCampusWalkOrigin(origin)) return "ready";
  if (locating && !origin) return "locating";
  return "unavailable";
}

export function walkTimeLabel(minutes: number | null, status: WalkTimeStatus): string {
  if (minutes != null) return `${minutes} min walk`;
  if (status === "locating") return "Locating…";
  return "Walk time unavailable";
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
    imageAlt: placeCardImageAlt(item.markerId, item.title),
    imageObjectPosition: placeCardImageObjectPosition(item.markerId),
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
    if (a.walkMinutes == null && b.walkMinutes == null) return a.name.localeCompare(b.name);
    if (a.walkMinutes == null) return 1;
    if (b.walkMinutes == null) return -1;
    return a.walkMinutes - b.walkMinutes;
  });
  return scored.slice(0, limit).map((landmark) => ({
    id: `place:${landmark.id}`,
    markerId: landmark.id,
    name: landmark.name,
    categoryLabel: placeCategoryLabel(landmark.id, landmark.category),
    imageUrl: placeCardImage(landmark.id),
    imageAlt: placeCardImageAlt(landmark.id, landmark.name),
    imageObjectPosition: placeCardImageObjectPosition(landmark.id),
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
  const rows: Array<AthleticsHighlight & { startMs: number }> = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const event of group.events ?? []) {
      if (!isAthleticsEvent(event)) continue;
      const start = Date.parse(event.startsAt);
      const startMs = Number.isFinite(start) ? start : nowMs;
      const endedAt = startMs + 4 * 60 * 60 * 1000;
      if (endedAt < nowMs - 7 * 24 * 60 * 60 * 1000) continue;
      if (startMs > nowMs + 21 * 24 * 60 * 60 * 1000) continue;
      const id = event.externalEventId ?? event.sourceExternalId ?? event.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const sport = (event.sport ?? event.category ?? "Athletics").trim() || "Athletics";
      const opponent = event.opponent?.trim() || null;
      rows.push({
        id,
        type: "athletics",
        title: athleticsDisplayTitle(event.title, opponent),
        sport,
        opponent,
        timeLabel: eventTimeShort(event.startsAt, now),
        durationLabel: null,
        imageUrl: event.imageUrl?.trim() || athleticsFallbackImage(sport, rows.length),
        imageFallbackUrl: null,
        broadcastUrl: event.broadcastUrl ?? null,
        youtubeVideoId: null,
        url: event.broadcastUrl?.trim() || event.eventUrl?.trim() || null,
        playable: Boolean(event.broadcastUrl?.trim() || event.eventUrl?.trim()),
        startMs,
      });
    }
  }
  rows.sort((a, b) => {
    const aUpcoming = a.startMs >= nowMs ? 0 : 1;
    const bUpcoming = b.startMs >= nowMs ? 0 : 1;
    if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
    return aUpcoming === 0 ? a.startMs - b.startMs : b.startMs - a.startMs;
  });
  return rows.slice(0, limit).map(({ startMs: _start, ...row }) => row);
}

export function youtubeSourceToHighlight(source: RhodyYoutubeHighlightSource): AthleticsHighlight {
  const duration = source.duration?.trim() || null;
  return {
    id: `youtube:${source.youtubeVideoId}`,
    type: "youtube",
    title: source.title,
    sport: source.category,
    opponent: null,
    timeLabel: null,
    durationLabel: duration,
    imageUrl: youtubeThumbnailUrl(source.youtubeVideoId),
    imageFallbackUrl: youtubeThumbnailFallbackUrl(source.youtubeVideoId),
    broadcastUrl: youtubeWatchUrl(source.youtubeVideoId),
    youtubeVideoId: source.youtubeVideoId,
    url: youtubeWatchUrl(source.youtubeVideoId),
    playable: true,
  };
}

/** Curated YouTube rows first, then live athletics, then structural placeholders. */
export function buildRhodyHighlights(
  groups: Array<Pick<GroupedMapLocation, "events">>,
  now = new Date(),
  limit = 3,
  youtubeSources: readonly RhodyYoutubeHighlightSource[] = RHODY_YOUTUBE_HIGHLIGHTS,
): AthleticsHighlight[] {
  const youtube = youtubeSources.slice(0, limit).map(youtubeSourceToHighlight);
  const remaining = Math.max(0, limit - youtube.length);
  const athletics = remaining > 0 ? collectAthleticsHighlights(groups, now, remaining) : [];
  return athleticsHighlightSlots([...youtube, ...athletics], limit);
}

/** Keep the target 3-row athletics card even when no games have loaded. */
export function athleticsHighlightSlots(items: AthleticsHighlight[], limit = 3): AthleticsHighlight[] {
  const filled = items.slice(0, limit);
  if (filled.length >= limit) return filled;
  const pads = ATHLETICS_FALLBACK_IMAGES.slice(0, limit - filled.length).map((imageUrl, index) => {
    const slot = filled.length + index;
    return {
      id: `athletics-slot-${slot}`,
      type: "placeholder" as const,
      title: "Rhody highlights will appear here",
      sport: slot === 0 ? "Athletics" : slot === 1 ? "Upcoming" : "Results",
      opponent: null,
      timeLabel: null,
      durationLabel: null,
      imageUrl,
      imageFallbackUrl: null,
      broadcastUrl: null,
      youtubeVideoId: null,
      url: null,
      playable: false,
    };
  });
  return [...filled, ...pads];
}

export function compactDiscoveryReason(reasonLabel: string | null | undefined, happeningToday = false): string {
  const raw = reasonLabel?.trim() || "";
  if (/interested in/i.test(raw)) return raw;
  if (/campus connection/i.test(raw) || /organization you follow/i.test(raw)) {
    return "Meet people with similar interests";
  }
  if (happeningToday) return "Looking for something fun tonight?";
  if (/popular/i.test(raw) || /campus-wide/i.test(raw)) return "Try something new";
  if (raw) return raw;
  return "Recommended for you";
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

function athleticsDisplayTitle(title: string, opponent: string | null): string {
  if (opponent) return `URI vs. ${opponent}`;
  return title.trim() || "Rhody Athletics";
}

function athleticsFallbackImage(sport: string, index: number): string {
  const s = sport.toLowerCase();
  if (s.includes("basket")) return "/quad-feed/womens-basketball.jpg";
  if (s.includes("soccer") || s.includes("track") || s.includes("cross")) return "/quad-feed/running.jpg";
  if (s.includes("football") || s.includes("run")) return "/quad-feed/ram-run.png";
  return ATHLETICS_FALLBACK_IMAGES[index % ATHLETICS_FALLBACK_IMAGES.length] ?? "/quad-feed/gym.jpg";
}

function eventTimeShort(startsAt: string, now: Date): string | null {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today • ${time}`;
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} • ${time}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
