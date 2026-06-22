import type { AchievementDef } from "./achievementsCatalog";
import type { Character } from "./types";

export const TORCH_BEARER_BADGE_ID = "torch_bearer_badge";
export const TORCH_BEARER_IMAGE_URL = "/badges/torch-bearer-badge.png";
export const TORCH_BEARER_MAX_RECIPIENTS = 30;

export function hasTorchBearerBadge(character: Character): boolean {
  return typeof character.torchBearerFounderNumber === "number" && character.torchBearerFounderNumber >= 1;
}

export function getTorchBearerDisplayName(founderNumber: number): string {
  return `Torch Bearer Badge #${founderNumber}`;
}

export function getAchievementDisplayName(def: AchievementDef, character?: Character): string {
  if (def.id === TORCH_BEARER_BADGE_ID && character && hasTorchBearerBadge(character)) {
    return getTorchBearerDisplayName(character.torchBearerFounderNumber!);
  }
  return def.name;
}

export function getAchievementDisplayDescription(def: AchievementDef): string {
  if (def.id === TORCH_BEARER_BADGE_ID) {
    return "Awarded to the original 30 CampusQuest beta testers who helped carry the first flame.";
  }
  return def.description;
}
