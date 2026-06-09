"use client";

import type { LootDropEntry } from "@/lib/lootLog";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type BossDropApiRow = {
  id: string;
  boss_id: string;
  item_id: string;
  item_name: string | null;
  quantity: number;
  rarity: string | null;
  earned_at: string;
};

export type InventoryApiRow = {
  item_id: string;
  quantity: number;
  acquired_at: string;
  updated_at: string;
  source?: string;
  item: {
    id: string;
    slug: string;
    name: string;
    description: string;
    item_type: string;
    rarity: string;
    icon_url: string | null;
  } | null;
};

export async function fetchBossDropsFromServer(limit = 250): Promise<BossDropApiRow[]> {
  try {
    const data = await fetchAuthed<{ drops: BossDropApiRow[] }>(`/api/me/boss?limit=${limit}`);
    return data.drops ?? [];
  } catch {
    return [];
  }
}

export async function persistBossDropToServer(payload: {
  bossId: string;
  bossName: string;
  cosmeticId: string;
  rarity?: string;
  isFinalBoss?: boolean;
}): Promise<BossDropApiRow | null> {
  try {
    const data = await postAuthed<{ drop: BossDropApiRow }, typeof payload>("/api/me/boss", payload);
    return data.drop ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[cq:persist] boss drop save failed", error);
    }
    return null;
  }
}

export async function fetchInventoryFromServer(): Promise<InventoryApiRow[]> {
  try {
    const data = await fetchAuthed<{ inventory: InventoryApiRow[] }>("/api/inventory");
    return data.inventory ?? [];
  } catch {
    return [];
  }
}

export function bossDropsToLootEntries(userId: string, drops: BossDropApiRow[]): LootDropEntry[] {
  return drops.map((drop) => ({
    id: drop.id,
    characterId: userId,
    cosmeticId: drop.item_id,
    bossName: drop.item_name ?? "Boss",
    isFinalBoss: false,
    rarity: (drop.rarity as LootDropEntry["rarity"]) ?? "common",
    obtainedAt: Date.parse(drop.earned_at) || Date.now(),
  }));
}

export function mergeCosmeticUnlocks(existing: string[], drops: BossDropApiRow[]): string[] {
  const set = new Set(existing);
  for (const drop of drops) {
    if (drop.item_id) set.add(drop.item_id);
  }
  return Array.from(set);
}
