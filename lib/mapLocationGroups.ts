import type { CampusLocationKey } from "@/lib/campusLocations";
import { isCampusLocationId } from "@/lib/locations/registry";
import type { RealmLocationId } from "@/lib/realm/locations";

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
};

export type MapQrPin = {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  expiresAt: string | null;
  scanPath: string;
  qrCode: string;
};

export type MapEventPin = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  organizationName: string | null;
  eventUrl: string | null;
};

export type GroupedMapLocation = {
  groupKey: string;
  locationKey: CampusLocationKey | null;
  realmLocationId: RealmLocationId | null;
  locationName: string;
  locationAddress: string | null;
  x: number;
  y: number;
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

export function mapLocationActivityCount(group: Pick<GroupedMapLocation, "qrCodes" | "quests" | "events">): number {
  return group.qrCodes.length + group.quests.length + group.events.length;
}

export function mapLocationQuestCount(group: Pick<GroupedMapLocation, "qrCodes" | "quests">): number {
  return group.qrCodes.length + group.quests.length;
}
