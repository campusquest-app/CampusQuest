import { getDailyQuests } from "@/lib/quests";
import { getLogsByActivity } from "@/lib/store";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import type { DailyQuest } from "@/lib/types";

function getProgressForQuest(quest: DailyQuest, logsByActivity: Record<string, number>): number {
  const activityIds: string[] = [];
  if (quest.stat === "strength") activityIds.push("gym");
  if (quest.stat === "stamina") activityIds.push("run");
  if (quest.stat === "knowledge") activityIds.push("study", "exam-prep", "group-study");
  if (quest.stat === "social") activityIds.push("club", "group-study");
  if (quest.stat === "focus") activityIds.push("deep-focus", "meditate");
  let count = 0;
  activityIds.forEach((id) => {
    count += logsByActivity[id] ?? 0;
  });
  return count;
}

export function buildDailyQuestBoardItems(characterId: string): UserQuestBoardItem[] {
  const quests = getDailyQuests();
  const logsByActivity = getLogsByActivity(characterId);
  return quests.map((q) => {
    const current = getProgressForQuest(q, logsByActivity);
    const done = current >= q.targetCount;
    return {
      id: `daily-${q.id}`,
      source: "daily" as const,
      name: q.title,
      description: q.description,
      xpReward: q.xpReward,
      difficulty: "easy" as const,
      questType: "daily" as const,
      icon: q.icon,
      requiresQr: false,
      completionMethod: "manual_log" as const,
      locationName: null,
      locationLat: null,
      locationLng: null,
      status: done ? "completed" : current > 0 ? "active" : "available",
      progress: {
        current: Math.min(current, q.targetCount),
        max: q.targetCount,
        percent: Math.min(100, Math.round((current / q.targetCount) * 100)),
      },
      startsAt: null,
      endsAt: null,
      repeatType: "daily" as const,
      canClaim: false,
    };
  });
}

export function filterQuestBoardItems(
  items: UserQuestBoardItem[],
  filter: import("@/lib/adminQuestTypes").AdminQuestFilter,
  opts?: { userLat?: number; userLng?: number },
): UserQuestBoardItem[] {
  if (filter === "all") return items;
  if (filter === "daily") return items.filter((i) => i.source === "daily" || i.questType === "daily");
  if (filter === "qr") return items.filter((i) => i.requiresQr || i.completionMethod === "qr_scan");
  if (filter === "active") {
    return items.filter((i) => i.status === "available" || i.status === "active" || i.status === "ready");
  }
  if (filter === "completed") return items.filter((i) => i.status === "completed");
  if (filter === "nearby") {
    const withLocation = items.filter((i) => i.locationLat != null && i.locationLng != null);
    const { userLat, userLng } = opts ?? {};
    if (userLat == null || userLng == null) return withLocation;
    return [...withLocation].sort((a, b) => {
      const da = haversineKm(userLat, userLng, a.locationLat!, a.locationLng!);
      const db = haversineKm(userLat, userLng, b.locationLat!, b.locationLng!);
      return da - db;
    });
  }
  return items;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
