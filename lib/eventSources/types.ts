export const EVENT_SOURCE_TYPES = [
  "urinvolved",
  "athletics",
  "fine_arts",
  "academic",
  "career",
  "recreation",
  "department",
  "campusquest",
  "manual",
] as const;

export type EventSourceType = (typeof EVENT_SOURCE_TYPES)[number];

export const CANONICAL_EVENT_CATEGORIES = [
  "Athletics",
  "Clubs",
  "Social",
  "Academic",
  "Career",
  "Fine Arts",
  "Recreation",
  "Entrepreneurship",
  "Community",
  "Campus Life",
] as const;

export type CanonicalEventCategory = (typeof CANONICAL_EVENT_CATEGORIES)[number];

export const ORGANIZATION_TYPES = [
  "student_club",
  "athletics_team",
  "academic_department",
  "campus_office",
  "arts_group",
  "entrepreneurship",
  "program",
  "campus_service",
  "student_business",
  "other",
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ATHLETICS_LIVE_STATUSES = ["upcoming", "live", "final", "cancelled"] as const;
export type AthleticsLiveStatus = (typeof ATHLETICS_LIVE_STATUSES)[number];

export const HOME_AWAY_VALUES = ["home", "away", "neutral"] as const;
export type HomeAway = (typeof HOME_AWAY_VALUES)[number];

/** Normalized imported event — maps onto `external_events` (plus native campus rows). */
export type NormalizedCampusEvent = {
  source: EventSourceType;
  sourceType: EventSourceType;
  externalId: string;
  title: string;
  description: string;
  organizationName: string | null;
  organizationId?: string | null;
  sport?: string | null;
  opponent?: string | null;
  homeAway?: HomeAway | null;
  category: CanonicalEventCategory;
  tags: string[];
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  venueName: string | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  eventUrl: string | null;
  ticketUrl: string | null;
  broadcastUrl: string | null;
  rsvpUrl: string | null;
  cqRsvpEnabled: boolean;
  isCancelled: boolean;
  liveStatus?: AthleticsLiveStatus | null;
  score?: string | null;
  audience?: string | null;
  visibility?: string | null;
  featured?: boolean;
  sourceIds?: Record<string, string>;
};

export type NormalizedCampusOrganization = {
  source: EventSourceType;
  sourceType: EventSourceType;
  externalId: string;
  name: string;
  organizationType: OrganizationType;
  description: string;
  logoUrl: string | null;
  category: string | null;
  tags: string[];
  websiteUrl: string | null;
  socialLinks?: Record<string, string>;
  contactEmail?: string | null;
  contactPhone?: string | null;
  locationText?: string | null;
  verified: boolean;
};

export type EventSourceSyncCounts = {
  eventsReceived: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsFailed: number;
  duplicatesMerged: number;
  orgsCreated: number;
  orgsUpdated: number;
  errors: string[];
};

export type EventSourceSyncResult = EventSourceSyncCounts & {
  source: EventSourceType;
  success: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  syncLogId?: string;
};

export type EventSourceAdapter = {
  source: EventSourceType;
  label: string;
  /** True when a live feed/API is configured for this environment. */
  isConfigured: () => boolean;
  /** Human-readable note shown in admin when the feed is missing. */
  configurationHint: string;
  sync: (syncType: "cron" | "manual" | "api") => Promise<EventSourceSyncResult>;
};
