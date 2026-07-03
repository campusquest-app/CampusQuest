export type AdminQuestDifficulty = "easy" | "medium" | "hard" | "legendary";

export type AdminQuestType = "daily" | "one_time" | "event" | "location" | "qr";

export type AdminQuestCompletionMethod = "manual_log" | "qr_scan" | "location_checkin" | "admin_approval";

export type AdminQuestVisibility = "active" | "hidden" | "draft" | "deleted";

export type AdminQuestRepeatType = "one_time" | "daily" | "weekly" | "monthly" | "custom";

export type AdminQuestRepeatLimit = "once_per_user" | "once_per_day" | "once_per_week" | "unlimited";

export type AdminQuestFilter = "all" | "daily" | "nearby" | "qr" | "active" | "completed";

export type AdminQuestRow = {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  difficulty: AdminQuestDifficulty;
  quest_type: AdminQuestType;
  location_name: string | null;
  location_key: string | null;
  location_id: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  map_pin_x: number | null;
  map_pin_y: number | null;
  requires_qr: boolean;
  qr_code_id: string | null;
  completion_method: AdminQuestCompletionMethod;
  visibility_status: AdminQuestVisibility;
  starts_at: string | null;
  ends_at: string | null;
  active_duration_minutes: number | null;
  repeat_type: AdminQuestRepeatType;
  repeat_limit: AdminQuestRepeatLimit;
  is_repeatable: boolean;
  expires_automatically: boolean;
  icon: string | null;
  image_url: string | null;
  organization_id: string | null;
  event_id: string | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Linked QR code metadata returned with admin quest list/detail. */
export type AdminQuestLinkedQr = {
  id: string;
  code: string;
  image_url: string | null;
  qr_png_url: string | null;
  metadata?: { scan_url?: string } | null;
};

export type AdminQuestCompletionRow = {
  id: string;
  quest_id: string;
  user_id: string;
  completed_at: string;
  xp_awarded: number;
  completion_method: string;
  proof_url: string | null;
  status: "completed" | "pending" | "rejected";
  completion_day: string | null;
};

export type QuestTemplateRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  default_xp: number;
  default_difficulty: AdminQuestDifficulty;
  default_completion_method: AdminQuestCompletionMethod;
  default_quest_type: AdminQuestType;
  default_repeat_type: AdminQuestRepeatType;
  default_repeat_limit: AdminQuestRepeatLimit;
  default_duration_minutes: number | null;
  default_requires_qr: boolean;
  default_map_enabled: boolean;
  default_image: string | null;
  is_builtin: boolean;
  usage_count: number;
  is_favorite: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserQuestBoardItem = {
  id: string;
  source: "daily" | "admin";
  name: string;
  description: string;
  xpReward: number;
  difficulty: AdminQuestDifficulty | "easy";
  questType: AdminQuestType | "daily";
  icon: string;
  requiresQr: boolean;
  completionMethod: AdminQuestCompletionMethod | "manual_log";
  locationName: string | null;
  locationId: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: "available" | "active" | "ready" | "completed" | "pending";
  progress: { current: number; max: number; percent: number };
  startsAt: string | null;
  endsAt: string | null;
  repeatType: AdminQuestRepeatType | "daily";
  canClaim: boolean;
  qrCodeId?: string | null;
};

export type AdminQuestAnalytics = {
  totalCompletions: number;
  uniqueUsers: number;
  totalXpAwarded: number;
  completionRate: number;
  activeProgressCount: number;
  qrScans: number;
};

export const ADMIN_QUEST_FILTER_OPTIONS: { id: AdminQuestFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "daily", label: "Daily" },
  { id: "nearby", label: "Nearby" },
  { id: "qr", label: "QR Required" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

export const DURATION_PRESETS = [
  { id: "60", label: "1 hour", minutes: 60 },
  { id: "180", label: "3 hours", minutes: 180 },
  { id: "1440", label: "1 day", minutes: 1440 },
  { id: "10080", label: "1 week", minutes: 10080 },
  { id: "custom", label: "Custom", minutes: null },
] as const;
