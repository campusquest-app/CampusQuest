import type { RealmLocationId } from "@/lib/realm/locations";
import { placeCardImage } from "@/lib/realm/placeImages";

/** Hero banner assets for Realm location sheets — same canonical mapping as nearby cards. */
export function getRealmLocationHeroImage(locationId: RealmLocationId): string | null {
  return placeCardImage(locationId);
}
