"use client";

import { Trophy } from "lucide-react";
import type { Character } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { useCountUp } from "@/lib/client/useCountUp";
import { ScaledProgressBar } from "@/components/ui/ScaledProgressBar";

/**
 * Premium XP / progression card. Lives BELOW the stats row so users read
 * identity before progression. Animated fill, shimmer sweep, and soft glow.
 */
export function ProfileXpCard({
  character,
  onOpenLeaderboard,
}: {
  character: Character;
  onOpenLeaderboard?: () => void;
}) {
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const targetPct = needed > 0 ? Math.min(100, (current / needed) * 100) : 0;

  const totalXp = useCountUp(character.totalXP);
  const remaining = Math.max(0, needed - current);

  return (
    <section className="cq-profile-xp cq-profile-fade-in" aria-label="Experience progress">
      <div className="cq-profile-xp-head">
        <span className="cq-profile-xp-level font-display cq-soft-breathe">Level {character.level}</span>
        <span className="cq-profile-xp-total tabular-nums">{totalXp.toLocaleString()} XP</span>
      </div>

      <ScaledProgressBar
        percent={targetPct}
        trackClassName="cq-profile-xp-track"
        fillClassName="cq-profile-xp-fill"
        animationKey={`profile-xp:${character.id}:${character.totalXP}`}
        durationMs={680}
        sparkle
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-label={`${current} of ${needed} XP toward level ${character.level + 1}`}
      />

      <p className="cq-profile-xp-caption tabular-nums">
        {current.toLocaleString()} / {needed.toLocaleString()} XP to Level {character.level + 1}
        <span className="cq-profile-xp-remaining"> · {remaining.toLocaleString()} to go</span>
      </p>
      {onOpenLeaderboard ? (
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="cq-profile-xp-leaderboard cq-profile-press"
        >
          <Trophy className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Leaderboard
        </button>
      ) : null}
    </section>
  );
}
