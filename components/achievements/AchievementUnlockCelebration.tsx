"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RARITY_LABELS } from "@/lib/achievementsCatalog";
import {
  dismissAchievementCelebration,
  subscribeAchievementCelebrations,
  type AchievementCelebrationPayload,
} from "@/lib/achievementCelebration";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { playAchievementUnlock } from "@/lib/playGameSound";
import { getTorchBearerDisplayName, TORCH_BEARER_BADGE_ID } from "@/lib/torchBearerBadge";
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
  const eyebrow = isTorchBearer ? "🔥 Mythic Achievement Unlocked" : "Achievement Unlocked";
  const description = isTorchBearer
    ? "Awarded to one of the first 30 CampusQuest beta testers who helped ignite the journey."
    : def.description;

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
        className={`cq-achievement-unlock-card relative z-10 w-full max-w-sm rounded-3xl border bg-gradient-to-b p-8 text-center ring-2 ${style.ring} ${style.glow} ${style.bg}`}
      >
        <p className="cq-achievement-unlock-eyebrow mb-3 font-display text-[11px] font-bold uppercase tracking-[0.35em] text-uri-gold">
          {eyebrow}
        </p>
        <div className="cq-achievement-unlock-badge mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-2xl border border-white/15 bg-black/30 shadow-inner overflow-hidden">
          <AchievementBadgeArt def={def} size="hero" />
        </div>
        <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white">{displayName}</h2>
        <p className={`mt-2 text-sm font-semibold uppercase tracking-[0.2em] ${style.text}`}>
          {RARITY_LABELS[def.rarity]}
          {isTorchBearer ? " Founder" : ""}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/60">{description}</p>
        {def.titleUnlock ? (
          <p className="mt-4 rounded-xl border border-uri-gold/30 bg-uri-gold/10 px-3 py-2 text-xs font-semibold text-uri-gold">
            Title unlocked: {def.titleUnlock}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            dismissAchievementCelebration();
            setActive(null);
          }}
          className="mt-7 w-full rounded-xl bg-uri-keaney py-3 text-sm font-bold text-white shadow-lg transition hover:bg-uri-keaney/90"
        >
          {isTorchBearer ? "View Badge" : "Continue"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
