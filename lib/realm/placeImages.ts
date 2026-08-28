/**
 * Canonical campus place photos keyed by stable Realm location IDs
 * (`library`, `engineering-hall`, …), never by display name.
 *
 * Nearby cards, location heroes, and any other place thumbnail should
 * resolve through `placeCardImage` so imagery stays consistent.
 */

const CAMPUS_MAP_PLACEHOLDER = "/maps/uri-campus-map.png";

const ILLEGITIMATE_PLACE_PHOTO = /\/icons\/locations\/|uri-campus-map-fantasy/;

/** Supplied URI photographs. Locations without a supplied photo are omitted. */
export const PLACE_IMAGES: Record<string, string> = {
  "business-building": "/images/places/uri/ballentine-business.jpg",
  "memorial-union": "/images/places/uri/memorial-union.jpg",
  "the-quad": "/images/places/uri/uri-quad.jpg",
  "butterfield-dining": "/images/places/uri/butterfield-dining.jpg",
  "rec-center": "/images/places/uri/fascitelli-fitness.jpg",
  "mainfare-dining": "/images/places/uri/hope-commons-mainfare.jpg",
  "engineering-hall": "/images/places/uri/fascitelli-engineering.jpg",
};

/** CSS object-position so cover-crops keep the building in frame. */
export const PLACE_IMAGE_OBJECT_POSITION: Record<string, string> = {
  "business-building": "center 40%",
  "memorial-union": "center 42%",
  "the-quad": "center 52%",
  "butterfield-dining": "center 42%",
  "rec-center": "38% 48%",
  "mainfare-dining": "center 28%",
  "engineering-hall": "center 48%",
};

const PLACE_IMAGE_ALT: Record<string, string> = {
  library: "Robert L. Carothers Library at the University of Rhode Island",
  "engineering-hall": "Fascitelli Center for Advanced Engineering at the University of Rhode Island",
  "business-building": "Ballentine Hall at the University of Rhode Island",
  "memorial-union": "Memorial Union at the University of Rhode Island",
  "the-quad": "The Quadrangle at the University of Rhode Island",
  "butterfield-dining": "Butterfield Dining Hall at the University of Rhode Island",
  "rec-center": "Anna Fascitelli Fitness and Wellness Center at the University of Rhode Island",
  "mainfare-dining": "Hope Commons Mainfare dining hall at the University of Rhode Island",
};

export const PLACE_IMAGE_IDS = [
  "library",
  "engineering-hall",
  "business-building",
  "memorial-union",
  "the-quad",
  "butterfield-dining",
  "rec-center",
  "mainfare-dining",
] as const;

function isIllegitimatePlacePhoto(url: string): boolean {
  return ILLEGITIMATE_PLACE_PHOTO.test(url);
}

/**
 * Resolve a place-card / hero image.
 * 1. Explicit photo on the place record, if it is not a cartoon icon or fantasy map
 * 2. Supplied URI canonical mapping
 * 3. Neutral CampusQuest campus-map placeholder
 */
export function placeCardImage(markerId: string, fallback?: string | null): string {
  const explicit = fallback?.trim() ?? "";
  if (explicit && !isIllegitimatePlacePhoto(explicit)) return explicit;
  return PLACE_IMAGES[markerId] ?? CAMPUS_MAP_PLACEHOLDER;
}

export function placeCardImageObjectPosition(markerId: string): string {
  return PLACE_IMAGE_OBJECT_POSITION[markerId] ?? "center center";
}

export function placeCardImageAlt(markerId: string, displayName?: string | null): string {
  if (PLACE_IMAGE_ALT[markerId]) return PLACE_IMAGE_ALT[markerId];
  const name = displayName?.trim();
  if (name) return `${name} at the University of Rhode Island`;
  return "Campus place at the University of Rhode Island";
}
