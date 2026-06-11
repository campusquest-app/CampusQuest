import type { RealmLocationId } from "./locations";

/** Shared coordinate space — matches uri-campus-map.png aspect (100 × 77.25). */
export const REALM_MAP_VIEW_WIDTH = 100;
export const REALM_MAP_VIEW_HEIGHT = 77.25;

export const REALM_MAP_REFERENCE_SRC = "/maps/uri-campus-map.png";

/** Fantasy parchment skin traced from the reference map — same layout, same aspect. */
export const REALM_MAP_FANTASY_SRC = "/maps/uri-campus-map-fantasy.jpg";

/** Walkways calibrated to URI Kingston map. */
export const REALM_TRACE_PATHS = {
  mainSpine:
    "M 44 46 Q 45 48 46 50 Q 46.5 52 47 54 Q 48 55.5 49 56 Q 50.5 59 52 62",
  northSpur: "M 58 38 Q 52 40 48 42 Q 46 44 44 46",
  eastSpur: "M 62 42 Q 60 40 58 38",
  upperLoop: "M 58 38 Q 54 36 50 38 Q 46 40 44 46",
  recToUnion: "M 52 62 Q 50 58 47 54",
} as const;

export type RealmBuildingFootprint = {
  id: RealmLocationId;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotate?: number;
};

/** Building footprints aligned to uri-campus-map.png. */
export const REALM_BUILDING_FOOTPRINTS: RealmBuildingFootprint[] = [
  { id: "library", cx: 44, cy: 46, w: 4.4, h: 3.4, rotate: -4 },
  { id: "the-quad", cx: 46, cy: 50, w: 5.8, h: 4.2 },
  { id: "memorial-union", cx: 47, cy: 54, w: 4.8, h: 3.6, rotate: 2 },
  { id: "rams-den", cx: 49, cy: 56, w: 3.6, h: 2.8, rotate: -2 },
  { id: "rec-center", cx: 52, cy: 62, w: 5.2, h: 3.8, rotate: 3 },
  { id: "engineering-hall", cx: 58, cy: 38, w: 4.6, h: 3.2, rotate: 6 },
  { id: "business-building", cx: 62, cy: 42, w: 4, h: 3, rotate: 4 },
];

export function footprintByLocationId(id: RealmLocationId): RealmBuildingFootprint | undefined {
  return REALM_BUILDING_FOOTPRINTS.find((b) => b.id === id);
}
