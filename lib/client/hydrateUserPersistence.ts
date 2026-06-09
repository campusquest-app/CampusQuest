"use client";

import {
  bossDropsToLootEntries,
  fetchBossDropsFromServer,
  fetchInventoryFromServer,
  mergeCosmeticUnlocks,
} from "@/lib/client/userPersistenceClient";
import { replaceLootEntriesForCharacter } from "@/lib/lootLog";
import { getCharacter, replaceLocalCharacter } from "@/lib/store";

/** Load authoritative boss drops + inventory from Supabase into local caches. */
export async function hydrateUserPersistenceFromServer(userId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const [drops, inventory] = await Promise.all([
    fetchBossDropsFromServer(250),
    fetchInventoryFromServer(),
  ]);

  const lootEntries = bossDropsToLootEntries(userId, drops);
  if (lootEntries.length > 0) {
    replaceLootEntriesForCharacter(userId, lootEntries);
  }

  const character = getCharacter();
  if (!character || character.id !== userId) return;

  const inventoryCosmeticSlugs = inventory
    .map((row) => row.item?.slug)
    .filter((slug): slug is string => Boolean(slug));

  const mergedUnlocks = mergeCosmeticUnlocks(
    [...(character.unlockedCosmetics ?? []), ...inventoryCosmeticSlugs],
    drops,
  );

  if (mergedUnlocks.length !== (character.unlockedCosmetics ?? []).length) {
    replaceLocalCharacter(
      {
        ...character,
        unlockedCosmetics: mergedUnlocks,
      },
      { skipRemoteSync: true },
    );
  }
}
