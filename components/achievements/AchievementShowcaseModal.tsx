"use client";

import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import {
  computeLegendScore,
  getEarnedAchievements,
  getEquippedTitleLabel,
  getFeaturedAchievementViews,
} from "@/lib/achievementEngine";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievementsCatalog";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { achievementLabel, AchievementBadgeArt } from "./AchievementBadgeArt";
import { getAchievementDisplayDescription } from "@/lib/torchBearerBadge";

export function AchievementShowcaseModal({
  character,
  open,
  onClose,
}: {
  character: Character;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  const equippedTitle = getEquippedTitleLabel(character);
  const featured = getFeaturedAchievementViews(character);
  const earned = getEarnedAchievements(character);
  const legendScore = computeLegendScore(character);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Achievement showcase"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-cq-elevated shadow-xl shadow-black/50 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 flex-shrink-0">
          <h2 className="font-display text-base font-semibold text-white">Achievement Showcase</h2>
          <button
            type="button"
            onClick={onClose}
            className="cq-tap-press rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5 flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Earned</p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {earned.length}
                <span className="text-sm font-normal text-white/40"> / {ACHIEVEMENT_CATALOG.length}</span>
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Trophy score</p>
              <p className="mt-1 font-display text-lg font-bold text-uri-gold">{legendScore.toLocaleString()}</p>
            </div>
          </div>

          {equippedTitle ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-1.5">Equipped title</p>
              <p className="font-display text-sm font-semibold tracking-wide text-uri-gold/95">{equippedTitle}</p>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">Featured</p>
            {featured.length === 0 ? (
              <p className="text-sm text-white/40">No featured achievements yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {featured.map(({ def, earnedAt }) => {
                  const style = RARITY_CSS[def.rarity];
                  return (
                    <div
                      key={def.id}
                      className={`cq-soft-breathe rounded-xl border bg-gradient-to-b p-3 text-center ring-1 ${style.ring} ${style.bg} ${style.glow}`}
                    >
                      <AchievementBadgeArt def={def} character={character} size="lg" className="mx-auto" />
                      <p className={`mt-1 text-xs font-bold leading-tight ${style.text}`}>
                        {achievementLabel(def, character)}
                      </p>
                      {earnedAt ? (
                        <p className="mt-1 text-[10px] text-white/35">
                          {new Date(earnedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">All earned</p>
            {earned.length === 0 ? (
              <p className="text-sm text-white/40">No achievements earned yet.</p>
            ) : (
              <ul className="space-y-2">
                {earned.map(({ def, earnedAt }) => {
                  const style = RARITY_CSS[def.rarity];
                  return (
                    <li
                      key={def.id}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <AchievementBadgeArt def={def} character={character} size="md" className="flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${style.text}`}>{achievementLabel(def, character)}</p>
                        <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                          {getAchievementDisplayDescription(def)}
                        </p>
                        {earnedAt ? (
                          <p className="text-[10px] text-white/30 mt-1">
                            Earned {new Date(earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
