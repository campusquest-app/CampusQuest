"use client";

import type { Character } from "@/lib/types";
import { syncCatalogAchievements } from "@/lib/achievementEngine";
import { queueAchievementCelebration } from "@/lib/achievementCelebration";
import { getAchievementById } from "@/lib/achievementsCatalog";
import { hasTorchBearerBadge, TORCH_BEARER_BADGE_ID } from "@/lib/torchBearerBadge";
import { replaceLocalCharacter } from "@/lib/store";

/**
 * After server hydration, sync catalog achievements and queue unlock celebrations
 * for any achievement that has NOT yet been celebrated.
 *
 * Celebration is gated by `achievementCelebratedAt` (persisted to the DB via
 * game_state_json), not by "earned" state, so:
 *  - A freshly-awarded badge plays its modal exactly once, then is marked seen.
 *  - Reopening the app never replays an already-celebrated unlock.
 *
 * Torch Bearer is awarded server-side, so it is usually already "earned" (and thus
 * absent from `newlyUnlocked`). We celebrate it iff the server has not already
 * marked it celebrated — the award RPC sets `celebratedAt` for existing founders
 * (suppressing the modal) but leaves it unset for a brand-new award (plays once).
 */
export function syncAchievementsAfterHydrate(character: Character): Character {
  const newlyUnlocked = syncCatalogAchievements(character);
  replaceLocalCharacter(character, { skipRemoteSync: true });

  const celebrated = character.achievementCelebratedAt ?? {};

  for (const def of newlyUnlocked) {
    if (celebrated[def.id]) continue;
    queueAchievementCelebration(def, {
      founderNumber:
        def.id === TORCH_BEARER_BADGE_ID ? character.torchBearerFounderNumber : undefined,
    });
  }

  if (
    hasTorchBearerBadge(character) &&
    celebrated[TORCH_BEARER_BADGE_ID] == null &&
    !newlyUnlocked.some((def) => def.id === TORCH_BEARER_BADGE_ID)
  ) {
    const def = getAchievementById(TORCH_BEARER_BADGE_ID);
    if (def) {
      queueAchievementCelebration(def, { founderNumber: character.torchBearerFounderNumber });
    }
  }

  return character;
}
