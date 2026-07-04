import { isCampusLocationKey } from "@/lib/campusLocations";
import {
  campusLocationIdFromLegacyKey,
  isCampusLocationId,
  type CampusLocationId,
} from "@/lib/locations/registry";

/** Resolve a canonical Realm / campus location id from admin or API location fields. */
export function resolveRealmLocationIdFromFields(input: {
  locationId?: string | null;
  locationKey?: string | null;
}): CampusLocationId | null {
  const explicitId = (input.locationId ?? "").trim();
  if (isCampusLocationId(explicitId)) return explicitId;

  const rawKey = (input.locationKey ?? "").trim();
  if (!rawKey) return null;
  if (isCampusLocationId(rawKey)) return rawKey;
  if (isCampusLocationKey(rawKey)) return campusLocationIdFromLegacyKey(rawKey);
  if (/^[a-z0-9-]{2,64}$/.test(rawKey)) return rawKey;
  return campusLocationIdFromLegacyKey(rawKey);
}
