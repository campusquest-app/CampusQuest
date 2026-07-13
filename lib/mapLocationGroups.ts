import type { CampusLocationKey } from "@/lib/campusLocations";
import { isCampusLocationId } from "@/lib/locations/registry";
import { filterVisibleMapEvents } from "@/lib/realm/eventVisibility";
import type { RealmLocationId } from "@/lib/realm/locations";
import { countUniqueLocationQuests } from "@/lib/realm/locationQuestDedupe";

export type MapQuestPin = {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  difficulty: string | null;
  completionMethod: string | null;
  requiresQr: boolean;
  expiresAt: string | null;
  icon: string;
  qrCodeId?: string | null;
};

export type MapQrPin = {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  expiresAt: string | null;
  scanPath: string;
  qrCode: string;
  adminQuestId?: string | null;
};

export type MapEventPin = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  organizationName: string | null;
  eventUrl: string | null;
  /** "urinvolved" for imported URInvolved events; null/undefined for internal events. */
  source?: string | null;
  /** True when the event is cancelled (status flag or "(Cancelled)" in the title). */
  cancelled?: boolean;
  imageUrl?: string | null;
  category?: string | null;
  /** Raw location text from the source feed (e.g. "weldin hall"). */
  locationText?: string | null;
  /** DB id for external_events row (URInvolved). */
  externalEventId?: string | null;
  /** URInvolved source id (`external_events.external_id`), used for logical dedupe. */
  sourceExternalId?: string | null;
  updatedAt?: string | null;
  placementStatus?: string | null;
  matchConfidence?: number | null;
  matchReason?: string | null;
  needsReview?: boolean;
  /** True when an admin moved this event pin from the auto-matched location. */
  locationManuallyAdjusted?: boolean;
};

export type GroupedMapLocation = {
  groupKey: string;
  locationKey: CampusLocationKey | null;
  realmLocationId: RealmLocationId | null;
  locationName: string;
  locationAddress: string | null;
  x: number;
  y: number;
  /** Real-world coordinates for the Google map layer (derived when only percent pins exist). */
  lat: number | null;
  lng: number | null;
  attachToLandmark: boolean;
  qrCodes: MapQrPin[];
  quests: MapQuestPin[];
  events: MapEventPin[];
};

export const CAMPUS_KEY_TO_REALM: Partial<Record<CampusLocationKey, RealmLocationId>> = {
  quad: "the-quad",
  library: "library",
  memorial_union: "memorial-union",
  mackal_rec_center: "rec-center",
  academic_building: "engineering-hall",
  dining_hall: "rams-den",
  ryan_center: "rams-den",
};

export function realmLocationIdForCampusKey(key: CampusLocationKey | string | null): RealmLocationId | null {
  if (!key || key === "other") return null;
  if (isCampusLocationId(key)) return key;
  return CAMPUS_KEY_TO_REALM[key as CampusLocationKey] ?? null;
}

export function campusKeyForRealmLocationId(id: RealmLocationId): CampusLocationKey | null {
  for (const [key, realmId] of Object.entries(CAMPUS_KEY_TO_REALM) as [CampusLocationKey, RealmLocationId][]) {
    if (realmId === id) return key;
  }
  return null;
}

export function attachesToLandmark(key: CampusLocationKey | null): boolean {
  return Boolean(key && key !== "other" && CAMPUS_KEY_TO_REALM[key]);
}

export function emptyMapLocationContent(): Pick<GroupedMapLocation, "qrCodes" | "quests" | "events"> {
  return { qrCodes: [], quests: [], events: [] };
}

export function mapLocationActivityCount(
  group: Pick<GroupedMapLocation, "qrCodes" | "quests" | "events">,
  locationId?: string | null,
  now: Date = new Date(),
): number {
  // Events only count while inside their visibility window (until 24h after
  // they end) — expired events must not inflate pin activity counts.
  return mapLocationQuestCount(group, locationId) + filterVisibleMapEvents(group.events, now).length;
}

export function mapLocationQuestCount(
  group: Pick<GroupedMapLocation, "qrCodes" | "quests">,
  locationId?: string | null,
): number {
  return countUniqueLocationQuests(group, locationId);
}
