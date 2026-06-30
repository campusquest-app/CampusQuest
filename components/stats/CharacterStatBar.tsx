"use client";

import type { StatKey } from "@/lib/types";
import { ScaledProgressBar } from "@/components/ui/ScaledProgressBar";

const FILL_DURATION_MS = 700;
const STAGGER_MS = 60;

type CharacterStatBarProps = {
  stat: StatKey;
  fillPercent: number;
  index: number;
  prestigeMax?: boolean;
  animationKey: string;
};

export function CharacterStatBar({
  stat,
  fillPercent,
  index,
  prestigeMax = false,
  animationKey,
}: CharacterStatBarProps) {
  const fillClass = prestigeMax
    ? "cq-character-stat-bar__fill cq-character-stat-bar__fill--prestige"
    : `cq-character-stat-bar__fill cq-character-stat-bar__fill--${stat}`;

  return (
    <div className="cq-character-stat-bar" role="presentation" aria-hidden>
      <ScaledProgressBar
        percent={fillPercent}
        trackClassName="cq-character-stat-bar__track"
        fillClassName={fillClass}
        delayMs={index * STAGGER_MS}
        durationMs={FILL_DURATION_MS}
        animationKey={animationKey}
        sparkle
      />
    </div>
  );
}
