import type { ActivityLog } from "@/lib/types";
import { getActivityById } from "@/lib/activities";

export type ActivityFeedType =
  | "qr_check_in"
  | "quest_completed"
  | "xp_reward"
  | "manual_log"
  | "post_created"
  | "memory_saved"
  | "achievement"
  | "unknown";

export type ActivityFeedItem = {
  id: string;
  ts: number;
  icon: string;
  title: string;
  subtitle?: string;
  accent?: "xp" | "quest" | "achievement" | "event" | "post" | "memory";
  feedType: ActivityFeedType;
};

export type ServerActivityEvent = {
  id: string;
  activity_type: ActivityFeedType;
  title: string;
  description: string | null;
  xp_awarded: number;
  qr_code_id?: string | null;
  quest_id?: string | null;
  created_at: string;
};

const FALLBACK_TITLES: Record<ActivityFeedType, string> = {
  qr_check_in: "QR Check-In",
  quest_completed: "Quest Completed",
  xp_reward: "XP Earned",
  manual_log: "Activity Logged",
  post_created: "Posted on The Quad",
  memory_saved: "Memory Saved",
  achievement: "Achievement Unlocked",
  unknown: "Activity",
};

const FEED_ICONS: Record<ActivityFeedType, string> = {
  qr_check_in: "📍",
  quest_completed: "🏆",
  xp_reward: "⚡",
  manual_log: "⚡",
  post_created: "📝",
  memory_saved: "📷",
  achievement: "✦",
  unknown: "◎",
};

const FEED_ACCENTS: Record<ActivityFeedType, ActivityFeedItem["accent"]> = {
  qr_check_in: "event",
  quest_completed: "quest",
  xp_reward: "xp",
  manual_log: "xp",
  post_created: "post",
  memory_saved: "memory",
  achievement: "achievement",
  unknown: "xp",
};

export function resolveActivityFeedTitle(input: {
  feedType?: ActivityFeedType | string | null;
  title?: string | null;
  tags?: string[];
  activityId?: string;
}): string {
  const explicit = input.title?.trim();
  if (explicit) return explicit;

  const tagQr = input.tags?.[0];
  if (tagQr === "cq-qr" || tagQr === "cq-qr-scan") {
    const tagLabel = input.tags?.[1]?.trim();
    if (tagLabel) return tagLabel;
  }

  const manualNote = input.tags?.[0]?.trim();
  if (manualNote && manualNote !== "cq-qr" && manualNote !== "cq-qr-scan") {
    return manualNote;
  }

  const def = input.activityId ? getActivityById(input.activityId) : undefined;
  if (def?.label) return def.label;

  const type = (input.feedType ?? "unknown") as ActivityFeedType;
  return FALLBACK_TITLES[type] ?? FALLBACK_TITLES.unknown;
}

export function activityLogToFeedItem(log: ActivityLog): ActivityFeedItem {
  const feedType = (log.feedType ?? inferFeedTypeFromLog(log)) as ActivityFeedType;
  const title = resolveActivityFeedTitle({
    feedType,
    title: log.title,
    tags: log.tags,
    activityId: log.activityId,
  });

  const subtitle =
    log.description?.trim() ||
    (log.xpEarned && log.xpEarned > 0 ? `+${log.xpEarned} XP earned` : undefined) ||
    (log.minutes ? `${log.minutes} min` : undefined);

  return {
    id: `log-${log.id}`,
    ts: log.createdAt,
    icon: FEED_ICONS[feedType] ?? FEED_ICONS.unknown,
    title,
    subtitle,
    accent: FEED_ACCENTS[feedType] ?? "xp",
    feedType,
  };
}

export function serverEventToFeedItem(event: ServerActivityEvent): ActivityFeedItem {
  const feedType = (event.activity_type ?? "unknown") as ActivityFeedType;
  const title = resolveActivityFeedTitle({ feedType, title: event.title });
  const subtitle =
    event.description?.trim() ||
    (event.xp_awarded > 0 ? `+${event.xp_awarded} XP earned` : undefined);

  return {
    id: `srv-${event.id}`,
    ts: new Date(event.created_at).getTime(),
    icon: FEED_ICONS[feedType] ?? FEED_ICONS.unknown,
    title,
    subtitle,
    accent: FEED_ACCENTS[feedType] ?? "xp",
    feedType,
  };
}

function inferFeedTypeFromLog(log: ActivityLog): ActivityFeedType {
  if (log.feedType) return log.feedType;
  const tag = log.tags?.[0];
  if (tag === "cq-qr" || tag === "cq-qr-scan" || log.qrCodeId) {
    return log.questId ? "quest_completed" : "qr_check_in";
  }
  return "manual_log";
}

function dedupeFeedItems(items: ActivityFeedItem[]): ActivityFeedItem[] {
  const seen = new Set<string>();
  const out: ActivityFeedItem[] = [];

  for (const item of items.sort((a, b) => b.ts - a.ts)) {
    const bucket = Math.floor(item.ts / (5 * 60 * 1000));
    const key = `${item.feedType}:${item.title.toLowerCase()}:${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function mergeActivityFeed(args: {
  localLogs: ActivityLog[];
  serverEvents?: ServerActivityEvent[];
  achievements?: Array<{ id: string; ts: number; icon: string; title: string }>;
  limit?: number;
}): ActivityFeedItem[] {
  const serverQrIds = new Set((args.serverEvents ?? []).map((e) => e.qr_code_id).filter(Boolean));
  const serverQuestIds = new Set(
    (args.serverEvents ?? [])
      .filter((e) => e.activity_type === "quest_completed")
      .map((e) => e.quest_id)
      .filter(Boolean),
  );

  const items: ActivityFeedItem[] = [];

  for (const log of args.localLogs) {
    if (log.qrCodeId && serverQrIds.has(log.qrCodeId)) continue;
    if (log.questId && log.feedType === "quest_completed" && serverQuestIds.has(log.questId)) continue;
    items.push(activityLogToFeedItem(log));
  }

  for (const event of args.serverEvents ?? []) {
    items.push(serverEventToFeedItem(event));
  }

  for (const ach of args.achievements ?? []) {
    items.push({
      id: `ach-${ach.id}`,
      ts: ach.ts,
      icon: ach.icon,
      title: ach.title,
      subtitle: "Achievement unlocked",
      accent: "achievement",
      feedType: "achievement",
    });
  }

  return dedupeFeedItems(items)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, args.limit ?? 50);
}
