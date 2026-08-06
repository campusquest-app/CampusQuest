import type { RealmLocationId } from "@/lib/realm/locations";

export type LandmarkIconId =
  | "library"
  | "memorial-union"
  | "the-quad"
  | "dining-hall"
  | "rec-center"
  | "engineering-hall"
  | "business-building"
  | "rams-den"
  | "ryan-center"
  | "fine-arts"
  | "default";

const LANDMARK_ICON_MAP: Record<string, LandmarkIconId> = {
  library: "library",
  "memorial-union": "memorial-union",
  "the-quad": "the-quad",
  "dining-hall": "dining-hall",
  "rec-center": "rec-center",
  "engineering-hall": "engineering-hall",
  "business-building": "business-building",
  "rams-den": "rams-den",
  "ryan-center": "ryan-center",
  "fine-arts": "fine-arts",
};

export function landmarkIconForId(id: RealmLocationId | string | null | undefined): LandmarkIconId {
  if (!id) return "default";
  return LANDMARK_ICON_MAP[id] ?? "default";
}
