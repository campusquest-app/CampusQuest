import type { Character } from "./types";
import { replaceLocalCharacter } from "./store";
import { getAchievementById } from "./achievementsCatalog";
import { getEarnedAchievements } from "./achievementEngine";

const MAX_FEATURED = 3;

export function setFeaturedAchievements(character: Character, ids: string[]): Character {
  const earned = new Set(getEarnedAchievements(character).map((v) => v.def.id));
  character.featuredAchievementIds = ids.filter((id) => earned.has(id)).slice(0, MAX_FEATURED);
  replaceLocalCharacter(character);
  return character;
}

export function toggleFeaturedAchievement(character: Character, id: string): Character {
  const current = [...(character.featuredAchievementIds ?? [])];
  const idx = current.indexOf(id);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    if (current.length >= MAX_FEATURED) current.shift();
    current.push(id);
  }
  return setFeaturedAchievements(character, current);
}

export function setEquippedTitle(character: Character, titleAchievementId: string | null): Character {
  if (titleAchievementId) {
    const def = getAchievementById(titleAchievementId);
    if (!def?.titleUnlock) return character;
    const earned = getEarnedAchievements(character).some((v) => v.def.id === titleAchievementId);
    if (!earned) return character;
  }
  character.equippedTitleId = titleAchievementId;
  replaceLocalCharacter(character);
  return character;
}
