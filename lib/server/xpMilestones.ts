import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

export const XP_UNLOCK_MILESTONES = [
  {
    key: "create_guild_300",
    threshold: 300,
    title: "Create Guild",
    description:
      "You've reached 300 total XP and unlocked Create Guild. Head to Guilds in the menu to start or join a guild and earn bonus XP with other Rams.",
  },
] as const;

export type XpMilestoneKey = (typeof XP_UNLOCK_MILESTONES)[number]["key"];

export type XpMilestoneStatus = {
  key: XpMilestoneKey;
  threshold: number;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  popupShownAt: string | null;
};

function isMissingMilestonesTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /unlocked_milestones/i.test(error.message ?? "");
}

export async function processXpMilestoneCrossings(args: {
  userId: string;
  previousTotalXp: number;
  currentTotalXp: number;
}): Promise<{ newlyUnlocked: XpMilestoneKey[] }> {
  const previousTotalXp = Math.max(0, Math.floor(args.previousTotalXp));
  const currentTotalXp = Math.max(0, Math.floor(args.currentTotalXp));
  if (currentTotalXp < previousTotalXp) {
    return { newlyUnlocked: [] };
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("unlocked_milestones")
    .select("milestone_key")
    .eq("user_id", args.userId);

  if (existingError) {
    if (isMissingMilestonesTable(existingError)) return { newlyUnlocked: [] };
    throw new ApiError(400, existingError.message, "MILESTONE_FETCH_FAILED");
  }

  const unlockedSet = new Set((existing ?? []).map((row) => row.milestone_key as string));
  const newlyUnlocked: XpMilestoneKey[] = [];
  const now = new Date().toISOString();

  for (const milestone of XP_UNLOCK_MILESTONES) {
    if (unlockedSet.has(milestone.key)) continue;
    if (previousTotalXp < milestone.threshold && currentTotalXp >= milestone.threshold) {
      const { error: insertError } = await admin.from("unlocked_milestones").insert({
        user_id: args.userId,
        milestone_key: milestone.key,
        unlocked_at: now,
        popup_shown_at: null,
      });
      if (insertError) {
        if (insertError.code === "23505") continue;
        if (isMissingMilestonesTable(insertError)) return { newlyUnlocked: [] };
        throw new ApiError(400, insertError.message, "MILESTONE_UNLOCK_FAILED");
      }
      newlyUnlocked.push(milestone.key);
      unlockedSet.add(milestone.key);
    }
  }

  return { newlyUnlocked };
}

export async function getUserXpMilestoneStatus(userId: string): Promise<{
  totalXp: number;
  milestones: XpMilestoneStatus[];
  pendingPopups: XpMilestoneStatus[];
}> {
  const admin = createAdminClient();
  const [{ data: stats, error: statsError }, { data: rows, error: rowsError }] = await Promise.all([
    admin.from("user_stats").select("total_xp").eq("user_id", userId).maybeSingle(),
    admin
      .from("unlocked_milestones")
      .select("milestone_key, unlocked_at, popup_shown_at")
      .eq("user_id", userId),
  ]);

  if (statsError) throw new ApiError(400, statsError.message, "MILESTONE_STATS_FAILED");
  if (rowsError) {
    if (isMissingMilestonesTable(rowsError)) {
      return {
        totalXp: Number(stats?.total_xp ?? 0),
        milestones: XP_UNLOCK_MILESTONES.map((def) => ({
          key: def.key,
          threshold: def.threshold,
          title: def.title,
          description: def.description,
          unlocked: false,
          unlockedAt: null,
          popupShownAt: null,
        })),
        pendingPopups: [],
      };
    }
    throw new ApiError(400, rowsError.message, "MILESTONE_FETCH_FAILED");
  }

  const rowMap = new Map(
    (rows ?? []).map((row) => [
      row.milestone_key as string,
      {
        unlockedAt: row.unlocked_at as string,
        popupShownAt: (row.popup_shown_at as string | null) ?? null,
      },
    ]),
  );

  const milestones: XpMilestoneStatus[] = XP_UNLOCK_MILESTONES.map((def) => {
    const row = rowMap.get(def.key);
    return {
      key: def.key,
      threshold: def.threshold,
      title: def.title,
      description: def.description,
      unlocked: Boolean(row),
      unlockedAt: row?.unlockedAt ?? null,
      popupShownAt: row?.popupShownAt ?? null,
    };
  });

  const pendingPopups = milestones.filter((milestone) => milestone.unlocked && !milestone.popupShownAt);

  return {
    totalXp: Number(stats?.total_xp ?? 0),
    milestones,
    pendingPopups,
  };
}

export async function markXpMilestonePopupShown(userId: string, milestoneKey: XpMilestoneKey): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("unlocked_milestones")
    .update({ popup_shown_at: now })
    .eq("user_id", userId)
    .eq("milestone_key", milestoneKey)
    .is("popup_shown_at", null);

  if (error) {
    if (isMissingMilestonesTable(error)) return;
    throw new ApiError(400, error.message, "MILESTONE_POPUP_MARK_FAILED");
  }
}
