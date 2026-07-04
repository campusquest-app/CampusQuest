import type { LandmarkIconId } from "@/lib/realm/landmarkIcons";
import type { RealmMarkerVariant } from "@/lib/realm/realmMapMarkerUtils";

export type MarkerTone = "building" | "quest" | "legendary" | "event" | "memories" | "qr" | "admin";

export function resolveMarkerTone(
  variant: RealmMarkerVariant,
  editMode: boolean,
): MarkerTone {
  if (editMode) return "admin";
  switch (variant) {
    case "legendary":
      return "legendary";
    case "quest":
      return "quest";
    case "event":
      return "event";
    case "memories":
      return "memories";
    case "qr":
      return "qr";
    default:
      return "building";
  }
}

export type MarkerIconKind =
  | "book"
  | "building"
  | "briefcase"
  | "star"
  | "utensils"
  | "dumbbell"
  | "cog"
  | "palette"
  | "map-pin"
  | "scroll"
  | "crown"
  | "calendar"
  | "image"
  | "qr"
  | "wrench";

export function resolveMarkerIconKind(
  variant: RealmMarkerVariant,
  landmarkIcon: LandmarkIconId,
  editMode: boolean,
): MarkerIconKind {
  if (editMode) return "wrench";

  switch (variant) {
    case "legendary":
      return "crown";
    case "quest":
      return "scroll";
    case "event":
      return "calendar";
    case "memories":
      return "image";
    case "qr":
      return "qr";
    default:
      break;
  }

  switch (landmarkIcon) {
    case "library":
      return "book";
    case "memorial-union":
    case "ryan-center":
      return "building";
    case "business-building":
      return "briefcase";
    case "the-quad":
      return "star";
    case "rams-den":
      return "utensils";
    case "rec-center":
      return "dumbbell";
    case "engineering-hall":
      return "cog";
    case "fine-arts":
      return "palette";
    default:
      return "map-pin";
  }
}
