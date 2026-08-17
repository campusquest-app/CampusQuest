import type { CampusLocationId } from "@/lib/locations/registry";

/**
 * Custom illustrated CampusQuest location icons (transparent PNGs) used in the
 * "Explore Today's Memories" carousel. Served from /public so they are lazily
 * loaded and HTTP-cached like any static asset. Missing entries fall back to the
 * registry marker emoji at the call site.
 */
export const LOCATION_ICON_SRC: Partial<Record<CampusLocationId, string>> = {
  "memorial-union": "/icons/locations/memorial-union.png",
  library: "/icons/locations/library.png",
  "rec-center": "/icons/locations/rec-center.png",
  "engineering-hall": "/icons/locations/engineering-hall.png",
  "the-quad": "/icons/locations/the-quad.png",
  "dining-hall": "/icons/locations/rams-den.png",
  "butterfield-dining": "/icons/locations/rams-den.png",
  "mainfare-dining": "/icons/locations/rams-den.png",
  "rams-den": "/icons/locations/rams-den.png",
};

export function getLocationIconSrc(id: CampusLocationId): string | null {
  return LOCATION_ICON_SRC[id] ?? null;
}
