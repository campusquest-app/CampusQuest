export type {
  CampusLocationId,
  CampusLocationRegistryEntry,
  CampusLocationRecord,
} from "@/lib/locations/campusLocationCatalog";

export {
  campusLocationIdFromLegacyKey,
  getCampusLocation,
  getCampusLocationCatalogSnapshot,
  getCampusLocationIds,
  getCampusLocationName,
  getCampusMemoryLocationOptions,
  isCampusLocationCatalogStale,
  isCampusLocationId,
  legacyCampusKeyFromLocationId,
  listCampusLocationRegistryEntries,
  realmLocationsFromCatalog,
  sortMemoryGroups,
  synthesizeCampusLocation,
  tryGetCampusLocation,
} from "@/lib/locations/campusLocationCatalog";

import {
  getCampusLocationIds,
  getCampusMemoryLocationOptions,
  listCampusLocationRegistryEntries,
} from "@/lib/locations/campusLocationCatalog";

/** Active canonical location slugs — refreshed when catalog cache updates. */
export const CAMPUS_LOCATION_IDS = getCampusLocationIds();

/** Full registry entries for active locations. */
export const CAMPUS_LOCATION_REGISTRY = listCampusLocationRegistryEntries();

/** Dropdown options for Add Memory. */
export const CAMPUS_MEMORY_LOCATION_OPTIONS = getCampusMemoryLocationOptions();
