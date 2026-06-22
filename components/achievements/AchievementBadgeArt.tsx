"use client";

import type { AchievementDef } from "@/lib/achievementsCatalog";
import { TORCH_BEARER_BADGE_ID } from "@/lib/torchBearerBadge";
import { getAchievementDisplayName } from "@/lib/torchBearerBadge";
import type { Character } from "@/lib/types";

export function AchievementBadgeArt({
  def,
  character,
  size = "md",
  className = "",
}: {
  def: AchievementDef;
  character?: Character;
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
}) {
  const dimension =
    size === "hero" ? "h-28 w-28" : size === "lg" ? "h-20 w-20" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const textSize =
    size === "hero" ? "text-6xl" : size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-2xl";

  if (def.imageUrl) {
    return (
      <img
        src={def.imageUrl}
        alt=""
        className={`${dimension} rounded-2xl object-cover shadow-inner border border-white/15 ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex ${dimension} items-center justify-center ${textSize} ${className}`} aria-hidden>
      {def.icon}
    </span>
  );
}

export function achievementLabel(def: AchievementDef, character?: Character): string {
  return getAchievementDisplayName(def, character);
}

export function isTorchBearerDef(def: AchievementDef): boolean {
  return def.id === TORCH_BEARER_BADGE_ID;
}
