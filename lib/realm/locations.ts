export type RealmLocationId =
  | "memorial-union"
  | "library"
  | "rec-center"
  | "engineering-hall"
  | "business-building"
  | "the-quad"
  | "rams-den";

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
  { id: "memorial-union", name: "Memorial Union" },
  { id: "library", name: "Library" },
  { id: "rec-center", name: "Rec Center" },
  { id: "engineering-hall", name: "Engineering Hall" },
  { id: "business-building", name: "Business Building" },
  { id: "the-quad", name: "The Quad" },
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

/** Mock Realm data — replace with API when backend is ready. */
export const REALM_LOCATIONS: RealmLocation[] = [
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
    activeQuests: 2,
    upcomingEvents: 1,
    studentPhotos: 14,
    eventTimer: { status: "countdown", minutesUntilStart: 18, label: "Campus mixer" },
    quests: [
      {
        id: "mu-check-in",
        name: "Campus Event Check-In",
        xp: 100,
        status: "active",
        offsetX: -4,
        offsetY: -7,
      },
    ],
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
    activeQuests: 1,
    upcomingEvents: 0,
    studentPhotos: 9,
    eventTimer: { status: "active", label: "Study Sprint" },
    quests: [
      {
        id: "lib-study",
        name: "Study Sprint",
        xp: 50,
        status: "active",
        offsetX: 5,
        offsetY: -5,
      },
    ],
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
    activeQuests: 1,
    upcomingEvents: 0,
    studentPhotos: 11,
    eventTimer: { status: "active", label: "Gym Check-In" },
    quests: [
      {
        id: "rec-gym",
        name: "Gym Check-In",
        xp: 80,
        status: "active",
        offsetX: 4,
        offsetY: 4,
      },
    ],
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
    activeQuests: 1,
    upcomingEvents: 1,
    studentPhotos: 6,
    eventTimer: { status: "countdown", minutesUntilStart: 45, label: "Project showcase" },
    quests: [
      {
        id: "eng-lab",
        name: "Lab Hours Log",
        xp: 60,
        status: "upcoming",
        offsetX: -3,
        offsetY: 5,
      },
    ],
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
    activeQuests: 0,
    upcomingEvents: 1,
    studentPhotos: 4,
    eventTimer: { status: "countdown", minutesUntilStart: 120, label: "Networking hour" },
    quests: [],
    moments: [],
  },
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
    activeQuests: 1,
    upcomingEvents: 0,
    studentPhotos: 22,
    eventTimer: { status: "active", label: "Quad vibes" },
    quests: [
      {
        id: "quad-post",
        name: "Post Drop",
        xp: 35,
        status: "active",
        offsetX: 8,
        offsetY: 2,
      },
    ],
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
    activeQuests: 1,
    upcomingEvents: 0,
    studentPhotos: 8,
    eventTimer: { status: "countdown", minutesUntilStart: 8, label: "Game watch party" },
    quests: [
      {
        id: "den-watch",
        name: "Game Night Check-In",
        xp: 45,
        status: "active",
        offsetX: -6,
        offsetY: 3,
      },
    ],
    moments: [],
  },
];
