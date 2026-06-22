"use client";

import type { Character } from "@/lib/types";
import { syncCatalogAchievements } from "@/lib/achievementEngine";
import { queueAchievementCelebration } from "@/lib/achievementCelebration";
import { TORCH_BEARER_BADGE_ID } from "@/lib/torchBearerBadge";
import { replaceLocalCharacter } from "@/lib/store";

/** After server hydration, sync catalog achievements and queue unlock celebrations. */
export function syncAchievementsAfterHydrate(character: Character): Character {
  const unlocked = syncCatalogAchievements(character);
  replaceLocalCharacter(character, { skipRemoteSync: true });

  for (const def of unlocked) {
    queueAchievementCelebration(def, {
      founderNumber:
        def.id === TORCH_BEARER_BADGE_ID ? character.torchBearerFounderNumber : undefined,
    });
  }

  return character;
}
