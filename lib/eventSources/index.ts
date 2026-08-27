export { EVENT_SOURCE_TYPES, CANONICAL_EVENT_CATEGORIES, ORGANIZATION_TYPES } from "@/lib/eventSources/types";
export type {
  EventSourceType,
  CanonicalEventCategory,
  OrganizationType,
  NormalizedCampusEvent,
  EventSourceAdapter,
  EventSourceSyncResult,
} from "@/lib/eventSources/types";
export {
  eventSourceLabel,
  eventSourceActionLabel,
  eventSourceChipLabel,
  eventSourcePresentation,
  isImportedEventSource,
  isEventSourceType,
  coerceEventSourceType,
} from "@/lib/eventSources/catalog";
export { canonicalEventCategory, eventMatchesCanonicalCategory } from "@/lib/eventSources/categories";
export { eventsLikelyDuplicate, mergeSourceIds } from "@/lib/eventSources/dedupe";
export { inferOrganizationType, organizationTypeLabel } from "@/lib/eventSources/organizationTypes";
