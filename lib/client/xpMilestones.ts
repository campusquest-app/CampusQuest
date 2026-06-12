"use client";

import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type XpMilestoneKey = "create_guild_300";

export type XpMilestoneStatus = {
  key: XpMilestoneKey;
  threshold: number;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  popupShownAt: string | null;
};

export type XpMilestoneSnapshot = {
  totalXp: number;
  milestones: XpMilestoneStatus[];
  pendingPopups: XpMilestoneStatus[];
};

export async function fetchXpMilestoneStatus(): Promise<XpMilestoneSnapshot> {
  const data = await fetchAuthed<XpMilestoneSnapshot>("/api/me/milestones");
  return data;
}

export async function evaluateXpMilestoneCrossing(
  previousTotalXp: number,
  currentTotalXp: number,
): Promise<XpMilestoneSnapshot & { newlyUnlocked: XpMilestoneKey[] }> {
  const data = await postAuthed<
    XpMilestoneSnapshot & { newlyUnlocked: XpMilestoneKey[] },
    { previousTotalXp: number; currentTotalXp: number }
  >("/api/me/milestones/evaluate", { previousTotalXp, currentTotalXp });
  return data;
}

export async function markXpMilestonePopupShown(milestoneKey: XpMilestoneKey): Promise<void> {
  await postAuthed("/api/me/milestones/popup-shown", { milestoneKey });
}
