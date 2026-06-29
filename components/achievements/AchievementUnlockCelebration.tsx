"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck } from "lucide-react";
import { RARITY_LABELS } from "@/lib/achievementsCatalog";
import {
  dismissAchievementCelebration,
  subscribeAchievementCelebrations,
  type AchievementCelebrationPayload,
} from "@/lib/achievementCelebration";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { playAchievementUnlock } from "@/lib/playGameSound";
import { getTorchBearerDisplayName, TORCH_BEARER_BADGE_ID } from "@/lib/torchBearerBadge";
import { markAchievementCelebrated } from "@/lib/store";
import { focusAchievement } from "@/lib/client/achievementFocus";
import { AchievementBadgeArt } from "./AchievementBadgeArt";

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  left: `${(i * 17) % 100}%`,
  delay: `${(i * 0.07) % 1.2}s`,
  color: ["#68abe8", "#fbbf24", "#a78bfa", "#f472b6", "#34d399"][i % 5],
}));

export function AchievementUnlockCelebration() {
  const [active, setActive] = useState<AchievementCelebrationPayload | null>(null);

  useEffect(() => {
    return subscribeAchievementCelebrations((payload) => {
      setActive(payload);
      playAchievementUnlock();
    });
  }, []);

  if (!active || typeof document === "undefined") return null;

  const { def, founderNumber } = active;
  const style = RARITY_CSS[def.rarity];
  const isTorchBearer = def.id === TORCH_BEARER_BADGE_ID;
  const displayName =
    isTorchBearer && founderNumber != null ? getTorchBearerDisplayName(founderNumber) : def.name;
  const eyebrow = isTorchBearer ? "Mythic Achievement Unlocked" : "Achievement Unlocked";
  const description = isTorchBearer
    ? "Awarded to one of the original 30 CampusQuest pioneers who helped ignite the journey."
    : def.description;

  function handleDismiss() {
    markAchievementCelebrated(def.id);
    dismissAchievementCelebration();
    setActive(null);
  }

  function handleViewBadge() {
    markAchievementCelebrated(def.id);
    focusAchievement(def.id);
    dismissAchievementCelebration();
    setActive(null);
  }

  return createPortal(
    <div
      className="cq-achievement-unlock fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Achievement unlocked"
    >
      <div className="cq-achievement-unlock-backdrop absolute inset-0 bg-black/88 backdrop-blur-sm" aria-hidden />
      <div className="cq-achievement-unlock-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {CONFETTI.map((c) => (
          <span
            key={c.id}
            className="cq-achievement-confetti-piece absolute top-0 h-2 w-2 rounded-sm opacity-90"
            style={{ left: c.left, backgroundColor: c.color, animationDelay: c.delay }}
          />
        ))}
      </div>

      <div
        className={`cq-achievement-unlock-card relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 p-6 text-center ring-1 sm:p-8 ${style.ring} ${style.glow}`}
      >
        {/* Rarity-tinted accent glow sits BEHIND content so all text stays on the dark navy surface. */}
        <div className={`cq-achievement-unlock-aura bg-gradient-to-b ${style.bg}`} aria-hidden />

        <div className="relative">
          <p className="cq-achievement-unlock-eyebrow mb-4 font-display text-[11px] font-bold uppercase tracking-[0.32em] text-amber-300">
            {eyebrow}
          </p>

          <div className="cq-achievement-unlock-badge mx-auto mb-5 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-inner">
            <AchievementBadgeArt def={def} size="hero" />
          </div>

          <h2 className="cq-achievement-unlock-title font-display text-[1.6rem] font-black uppercase leading-[1.05] tracking-tight text-white sm:text-3xl">
            {displayName}
          </h2>

          <p className="mt-3">
            <span
              className={`cq-achievement-unlock-rarity inline-flex items-center rounded-full border border-white/12 bg-black/35 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${style.text}`}
            >
              {RARITY_LABELS[def.rarity]}
              {isTorchBearer ? " Founder" : ""}
            </span>
          </p>

          <p className="cq-achievement-unlock-desc mx-auto mt-4 max-w-[19rem] text-[0.9375rem] font-medium leading-7 text-white/85">
            {description}
          </p>

          {def.titleUnlock ? (
            <div className="cq-achievement-reward-card mt-5 flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0a1733]/85 p-3.5 text-left backdrop-blur-sm">
              <span className="cq-achievement-reward-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-300">
                <BadgeCheck className="h-6 w-6" strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-white/70">
                  Unlocked Title
                </span>
                <span className="cq-achievement-reward-title block truncate text-lg font-extrabold uppercase tracking-tight text-amber-200">
                  {def.titleUnlock}
                </span>
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={isTorchBearer ? handleViewBadge : handleDismiss}
            className="cq-achievement-unlock-primary mt-6 w-full rounded-xl bg-gradient-to-r from-[#1c6fd1] to-[#2f8ae6] py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_8px_24px_-8px_rgba(47,138,230,0.7)] transition hover:from-[#2a7ee0] hover:to-[#3f9bf2] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1733]"
          >
            {isTorchBearer ? "View Badge" : "Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
