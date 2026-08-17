export type RealmLocationId = string;

export type RealmQuestStatus = "active" | "upcoming";

export type RealmEventUrgency = "none" | "soft" | "pulse" | "sparkle";

export interface RealmQuest {
  id: string;
  name: string;
  xp: number;
  status: RealmQuestStatus;
  /** Offset from building anchor (% of map width/height). */
  offsetX: number;
  offsetY: number;
}

export interface RealmEventTimer {
  status: "active" | "countdown";
  minutesUntilStart?: number;
  label: string;
}

export interface RealmMoment {
  id: string;
  postId: string;
  authorUserId: string;
  imageUrl?: string;
  caption: string;
  username: string;
  displayName: string;
  authorAvatar: string;
  timestamp: string;
  postedAgoLabel: string;
  expiresInLabel: string;
  likeCount?: number;
  sparkCount?: number;
  commentCount?: number;
  createdAt?: string;
}

export interface RealmLocation {
  id: RealmLocationId;
  name: string;
  /** Plain-language location description used by functional map details. */
  description?: string;
  /** Catalog category used for the optional location badge. */
  category?: string;
  /** Fantasy landmark name — display flavor only, never used for logic. */
  fantasyName: string;
  /** One-line exploration flavor for the archive header — display only. */
  flavorText: string;
  /** Map pin emoji — recognizable at a glance. */
  markerEmoji: string;
  /** Short label when map is zoomed out. */
  shortLabel: string;
  /** Show when zoomed out; secondary buildings hide until user zooms in. */
  major: boolean;
  /** Percentage position — calibrated to uri-campus-map.png (admin-only). */
  x: number;
  y: number;
  activeQuests: number;
  upcomingEvents: number;
  studentPhotos: number;
  /** Active Realm Moments (24h) at this pin — hydrated from API. */
  activeMomentCount?: number;
  quests: RealmQuest[];
  eventTimer: RealmEventTimer;
  moments: RealmMoment[];
}

export const REALM_LOCATION_OPTIONS: { id: RealmLocationId; name: string }[] = [
  { id: "the-quad", name: "The Quad" },
  { id: "butterfield-dining", name: "Butterfield Dining Hall" },
  { id: "mainfare-dining", name: "Mainfare Dining Hall" },
  { id: "memorial-union", name: "Memorial Union" },
  { id: "library", name: "Library" },
  { id: "rec-center", name: "Rec Center" },
  { id: "engineering-hall", name: "Engineering Hall" },
  { id: "business-building", name: "Business Building" },
  { id: "rams-den", name: "Rams Den" },
];

export function getRealmLocationName(id: RealmLocationId): string {
  return REALM_LOCATION_OPTIONS.find((l) => l.id === id)?.name ?? id;
}

export function getRealmEventUrgency(timer: RealmEventTimer): RealmEventUrgency {
  if (timer.status === "active") return "pulse";
  const mins = timer.minutesUntilStart ?? 999;
  if (mins <= 10) return "sparkle";
  if (mins <= 30) return "pulse";
  if (mins <= 60) return "soft";
  return "none";
}

export function formatRealmEventLabel(timer: RealmEventTimer): string {
  if (timer.status === "active") return "Active Now";
  const mins = timer.minutesUntilStart ?? 0;
  if (mins <= 0) return "Starting soon";
  if (mins < 60) return `Starts in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`;
}

/** Default activity fields — hydrated from map API at runtime. */
export const EMPTY_REALM_ACTIVITY = {
  activeQuests: 0,
  upcomingEvents: 0,
  studentPhotos: 0,
  quests: [] as RealmQuest[],
  eventTimer: { status: "countdown" as const, minutesUntilStart: 999, label: "No scheduled events" },
};

/** Base campus landmark pins — quest/event counts come from the map API. */
export const REALM_LOCATIONS: RealmLocation[] = [
  {
    id: "the-quad",
    name: "The Quad",
    fantasyName: "Central Kingdom Green",
    flavorText: "The heart of the kingdom — every campus path leads here.",
    markerEmoji: "✨",
    shortLabel: "The Quad",
    major: true,
    x: 46,
    y: 50,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "butterfield-dining",
    name: "Butterfield Dining Hall",
    description: "All-you-care-to-eat dining on Butterfield Road — breakfast through dinner.",
    category: "dining",
    fantasyName: "Butterfield Dining Hall",
    flavorText: "All-you-care-to-eat dining on Butterfield Road — breakfast through dinner.",
    markerEmoji: "🍽",
    shortLabel: "Butterfield",
    major: true,
    x: 51,
    y: 57,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "mainfare-dining",
    name: "Mainfare Dining Hall",
    description: "Hope Commons dining — Mainfare stations, late plates, and campus meals.",
    category: "dining",
    fantasyName: "Mainfare Dining Hall",
    flavorText: "Hope Commons dining — Mainfare stations, late plates, and campus meals.",
    markerEmoji: "🍽",
    shortLabel: "Mainfare",
    major: true,
    x: 56,
    y: 40,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "memorial-union",
    name: "Memorial Union",
    fantasyName: "Grand Adventurer's Guild Hall",
    flavorText: "Guild banners hang where Rams gather between quests.",
    markerEmoji: "🏛",
    shortLabel: "Union",
    major: true,
    x: 47,
    y: 54,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "library",
    name: "Library",
    fantasyName: "Arcane Knowledge Archive",
    flavorText: "Ancient tomes whisper secrets left by Rams who studied here.",
    markerEmoji: "📚",
    shortLabel: "Library",
    major: true,
    x: 44,
    y: 46,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "rec-center",
    name: "Rec Center",
    fantasyName: "Warrior Training Grounds",
    flavorText: "Steel your body before the next campus campaign.",
    markerEmoji: "🏋",
    shortLabel: "Rec Center",
    major: true,
    x: 52,
    y: 62,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "engineering-hall",
    name: "Engineering Hall",
    fantasyName: "Inventor's District",
    flavorText: "Gears turn and prototypes spark under inventor's lamps.",
    markerEmoji: "⚙",
    shortLabel: "Engineering",
    major: false,
    x: 58,
    y: 38,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "business-building",
    name: "Business Building",
    fantasyName: "Merchant's Quarter",
    flavorText: "Deals are struck and networks forged in merchant halls.",
    markerEmoji: "🏢",
    shortLabel: "Business",
    major: false,
    x: 62,
    y: 42,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
  {
    id: "rams-den",
    name: "Rams Den",
    fantasyName: "Rams Den Tavern",
    flavorText: "Stories and cheers echo from the tavern hearth.",
    markerEmoji: "🐏",
    shortLabel: "Rams Den",
    major: false,
    x: 49,
    y: 56,
    ...EMPTY_REALM_ACTIVITY,
    moments: [],
  },
];

/**
 * Retired map landmarks kept for historical location_id resolution only.
 * Never shown on the live map (isActive: false in catalog / DB).
 */
export const RETIRED_REALM_LOCATION_IDS = ["dining-hall"] as const;