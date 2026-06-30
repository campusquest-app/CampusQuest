import type { RealmLocationId } from "@/lib/realm/locations";

/** Hero banner assets for Realm location sheets (display only). */
const REALM_LOCATION_HERO_IMAGES: Partial<Record<RealmLocationId, string>> = {
  library: "/quad-feed/library.jpg",
  "rec-center": "/quad-feed/gym.jpg",
  "memorial-union": "/quad-feed/memorial-union.png",
  "the-quad": "/maps/uri-campus-map-fantasy.jpg",
  "engineering-hall": "/quad-feed/group-study.jpg",
  "business-building": "/quad-feed/career.jpg",
  "rams-den": "/quad-feed/coffee.jpg",
};

export function getRealmLocationHeroImage(locationId: RealmLocationId): string | null {
  return REALM_LOCATION_HERO_IMAGES[locationId] ?? null;
}
