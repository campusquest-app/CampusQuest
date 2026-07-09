export type {
  CatalogLocationLike,
  EventLocationMatch,
  UriAliasTarget,
} from "@/lib/server/urinvolved/mapEventLocationTypes";
export { URI_LOCATION_ALIASES } from "@/lib/server/urinvolved/mapEventLocationTypes";
export {
  mapEventToRealmLocation,
  matchEventLocationWithMeta,
  normalizeEventLocationText,
  normalizeLocationName,
} from "@/lib/server/urinvolved/eventLocationMatcher";
export type { EventLocationMatchMeta, EventLocationMatchResult } from "@/lib/server/urinvolved/eventLocationMatcher";
