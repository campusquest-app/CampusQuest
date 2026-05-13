"use client";

import type { LootRarity } from "./cosmetics";

export interface LootDropEntry {
  id: string;
  characterId: string;
  cosmeticId: string;
  bossName: string;
  isFinalBoss: boolean;
  rarity: LootRarity;
  obtainedAt: number;
}

const STORAGE_KEY = "campusquest_loot_log";

function loadLootLog(): LootDropEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLootLog(entries: LootDropEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore persistence failure (QuotaExceededError / blocked storage).
  }
}

export function getLootLogForCharacter(characterId: string): LootDropEntry[] {
  return loadLootLog()
    .filter((e) => e.characterId === characterId)
    .sort((a, b) => b.obtainedAt - a.obtainedAt);
}

export function addLootDrop(entry: Omit<LootDropEntry, "id">): void {
  const entries = loadLootLog();
  const newEntry: LootDropEntry = {
    ...entry,
    id: `loot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  entries.unshift(newEntry);
  saveLootLog(entries);
}

/** Replace server-backed entries for one character (used when hydrating from Supabase `clientMirror`). */
export function replaceLootEntriesForCharacter(characterId: string, entries: LootDropEntry[]): void {
  if (typeof window === "undefined") return;
  const rest = loadLootLog().filter((e) => e.characterId !== characterId);
  saveLootLog([...rest, ...entries]);
}
