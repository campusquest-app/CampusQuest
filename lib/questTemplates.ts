import type {
  AdminQuestCompletionMethod,
  AdminQuestDifficulty,
  AdminQuestRepeatLimit,
  AdminQuestRepeatType,
  AdminQuestType,
} from "@/lib/adminQuestTypes";
import type { CampusLocationKey } from "@/lib/campusLocations";

export type QuestTemplateDef = {
  id: string;
  name: string;
  category: string;
  categoryIcon: string;
  description: string;
  defaultXp: number;
  defaultDifficulty: AdminQuestDifficulty;
  defaultCompletionMethod: AdminQuestCompletionMethod;
  defaultQuestType: AdminQuestType;
  defaultRepeatType: AdminQuestRepeatType;
  defaultRepeatLimit: AdminQuestRepeatLimit;
  defaultDurationMinutes: number | null;
  defaultRequiresQr: boolean;
  defaultMapEnabled: boolean;
  defaultLocationKey?: CampusLocationKey;
  defaultIcon: string;
};

export const QUEST_TEMPLATE_CATEGORIES = [
  { id: "academic", label: "Academic", icon: "📚" },
  { id: "social", label: "Social", icon: "👥" },
  { id: "campus", label: "Campus Life", icon: "🏛" },
  { id: "service", label: "Service", icon: "🤝" },
  { id: "location", label: "Location Based", icon: "📍" },
  { id: "qr", label: "QR Based", icon: "📷" },
  { id: "special", label: "Special Events", icon: "⚔️" },
  { id: "organization", label: "Organization", icon: "🏢" },
] as const;

export const BUILTIN_QUEST_TEMPLATES: QuestTemplateDef[] = [
  {
    id: "tpl-study-session",
    name: "Study Session",
    category: "academic",
    categoryIcon: "📚",
    description: "Complete a focused study session on campus.",
    defaultXp: 50,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "manual_log",
    defaultQuestType: "one_time",
    defaultRepeatType: "daily",
    defaultRepeatLimit: "once_per_day",
    defaultDurationMinutes: 180,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultIcon: "📖",
  },
  {
    id: "tpl-library-challenge",
    name: "Library Challenge",
    category: "academic",
    categoryIcon: "📚",
    description: "Visit the library and log a study activity.",
    defaultXp: 60,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "location",
    defaultRepeatType: "weekly",
    defaultRepeatLimit: "once_per_week",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultLocationKey: "library",
    defaultIcon: "📚",
  },
  {
    id: "tpl-club-meeting",
    name: "Club Meeting",
    category: "social",
    categoryIcon: "👥",
    description: "Attend a recognized student organization meeting.",
    defaultXp: 75,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "event",
    defaultRepeatType: "weekly",
    defaultRepeatLimit: "once_per_week",
    defaultDurationMinutes: 180,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultLocationKey: "memorial_union",
    defaultIcon: "👥",
  },
  {
    id: "tpl-meet-someone-new",
    name: "Meet Someone New",
    category: "social",
    categoryIcon: "👥",
    description: "Connect with a new classmate or club member.",
    defaultXp: 40,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "manual_log",
    defaultQuestType: "one_time",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: false,
    defaultMapEnabled: false,
    defaultIcon: "🤝",
  },
  {
    id: "tpl-campus-exploration",
    name: "Campus Exploration",
    category: "campus",
    categoryIcon: "🏛",
    description: "Discover a new spot on campus.",
    defaultXp: 55,
    defaultDifficulty: "medium",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "location",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultLocationKey: "quad",
    defaultIcon: "🗺️",
  },
  {
    id: "tpl-rec-center",
    name: "Recreation Center Visit",
    category: "campus",
    categoryIcon: "🏛",
    description: "Check in at the recreation center.",
    defaultXp: 65,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "location",
    defaultRepeatType: "daily",
    defaultRepeatLimit: "once_per_day",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultLocationKey: "mackal_rec_center",
    defaultIcon: "🏋️",
  },
  {
    id: "tpl-volunteer",
    name: "Volunteer Event",
    category: "service",
    categoryIcon: "🤝",
    description: "Participate in a campus or community service event.",
    defaultXp: 100,
    defaultDifficulty: "medium",
    defaultCompletionMethod: "admin_approval",
    defaultQuestType: "event",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 10080,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultIcon: "💚",
  },
  {
    id: "tpl-check-in",
    name: "Check-In Quest",
    category: "location",
    categoryIcon: "📍",
    description: "Check in at the specified campus location.",
    defaultXp: 45,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "location",
    defaultRepeatType: "daily",
    defaultRepeatLimit: "once_per_day",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultIcon: "📍",
  },
  {
    id: "tpl-qr-hunt",
    name: "QR Hunt",
    category: "qr",
    categoryIcon: "📷",
    description: "Find and scan the hidden QR code to complete this quest.",
    defaultXp: 80,
    defaultDifficulty: "medium",
    defaultCompletionMethod: "qr_scan",
    defaultQuestType: "qr",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: true,
    defaultMapEnabled: true,
    defaultLocationKey: "memorial_union",
    defaultIcon: "📷",
  },
  {
    id: "tpl-event-qr",
    name: "Event QR Check-In",
    category: "qr",
    categoryIcon: "📷",
    description: "Scan the event QR code to check in and earn XP.",
    defaultXp: 90,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "qr_scan",
    defaultQuestType: "event",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 180,
    defaultRequiresQr: true,
    defaultMapEnabled: true,
    defaultIcon: "🎟️",
  },
  {
    id: "tpl-boss-battle",
    name: "Boss Battle",
    category: "special",
    categoryIcon: "⚔️",
    description: "Defeat a special CampusQuest boss challenge.",
    defaultXp: 500,
    defaultDifficulty: "legendary",
    defaultCompletionMethod: "qr_scan",
    defaultQuestType: "event",
    defaultRepeatType: "one_time",
    defaultRepeatLimit: "once_per_user",
    defaultDurationMinutes: 1440,
    defaultRequiresQr: true,
    defaultMapEnabled: true,
    defaultIcon: "⚔️",
  },
  {
    id: "tpl-gbm",
    name: "General Body Meeting",
    category: "organization",
    categoryIcon: "🏢",
    description: "Attend your organization's general body meeting.",
    defaultXp: 70,
    defaultDifficulty: "easy",
    defaultCompletionMethod: "location_checkin",
    defaultQuestType: "event",
    defaultRepeatType: "weekly",
    defaultRepeatLimit: "once_per_week",
    defaultDurationMinutes: 180,
    defaultRequiresQr: false,
    defaultMapEnabled: true,
    defaultIcon: "🏢",
  },
];

export function getBuiltinQuestTemplate(id: string): QuestTemplateDef | undefined {
  return BUILTIN_QUEST_TEMPLATES.find((t) => t.id === id);
}

export function searchQuestTemplates(query: string): QuestTemplateDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return BUILTIN_QUEST_TEMPLATES;
  return BUILTIN_QUEST_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );
}
