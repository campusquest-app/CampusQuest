"use client";

import type { Character } from "@/lib/types";
import { getEquippedTitleLabel, getFeaturedAchievementViews } from "@/lib/achievementEngine";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { achievementLabel, AchievementBadgeArt } from "./AchievementBadgeArt";
import { getAchievementDisplayDescription } from "@/lib/torchBearerBadge";

export function AchievementShowcaseStrip({
  character,
  compact = false,
}: {
  character: Character;
  compact?: boolean;
}) {
  const title = getEquippedTitleLabel(character);
  const featured = getFeaturedAchievementViews(character);
  if (!title && featured.length === 0) return null;

  return (
    <div className={compact ? "mt-1.5 space-y-1" : "mt-2.5 space-y-2"}>
      {title ? (
        <p
          className={`font-display font-semibold tracking-wide text-uri-gold/90 ${
            compact ? "text-[10px] uppercase" : "text-xs uppercase"
          }`}
        >
          {title}
        </p>
      ) : null}
      {featured.length > 0 ? (
        <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "gap-2"}`}>
          {featured.map(({ def }) => {
            const style = RARITY_CSS[def.rarity];
            return (
              <span
                key={def.id}
                title={getAchievementDisplayDescription(def)}
                className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-r px-2 py-0.5 ring-1 ${style.ring} ${style.bg} ${style.glow} ${
                  compact ? "text-[10px]" : "text-[11px]"
                }`}
              >
                <AchievementBadgeArt def={def} character={character} size="sm" className="!h-4 !w-4 !rounded-full" />
                <span className={`font-medium ${style.text}`}>{achievementLabel(def, character)}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
