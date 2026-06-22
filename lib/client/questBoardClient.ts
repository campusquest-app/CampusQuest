"use client";

import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { AdminQuestFilter, UserQuestBoardItem } from "@/lib/adminQuestTypes";

export async function fetchQuestBoardAdminItems(opts?: {
  filter?: AdminQuestFilter;
  lat?: number;
  lng?: number;
}): Promise<UserQuestBoardItem[]> {
  const params = new URLSearchParams();
  if (opts?.filter) params.set("filter", opts.filter);
  if (opts?.lat != null) params.set("lat", String(opts.lat));
  if (opts?.lng != null) params.set("lng", String(opts.lng));
  const qs = params.toString();
  const data = await fetchAuthed<{ quests: UserQuestBoardItem[] }>(`/api/quests/board${qs ? `?${qs}` : ""}`);
  return data.quests ?? [];
}

export async function completeAdminQuestRequest(questId: string, proofUrl?: string) {
  return postAuthed<{ questId: string; status: string; xpAwarded: number; leveledUp: boolean }, { proofUrl?: string }>(
    `/api/quests/admin/${questId}/complete`,
    proofUrl ? { proofUrl } : {},
  );
}

export async function fetchQuestMapPins() {
  return fetchAuthed<{ groups: Array<Record<string, unknown>> }>("/api/quests/map-pins");
}
