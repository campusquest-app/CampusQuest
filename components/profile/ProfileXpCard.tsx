"use client";

import { useEffect, useState } from "react";
import type { Character } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { useCountUp } from "@/lib/client/useCountUp";

/**
 * Premium XP / progression card. Lives BELOW the stats row so users read
 * identity before progression. Animated fill, shimmer sweep, and soft glow.
 */
export function ProfileXpCard({ character }: { character: Character }) {
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const targetPct = needed > 0 ? Math.min(100, (current / needed) * 100) : 0;

  const [pct, setPct] = useState(targetPct);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(targetPct));
    return () => cancelAnimationFrame(id);
  }, [targetPct]);

  const totalXp = useCountUp(character.totalXP);
  const remaining = Math.max(0, needed - current);

  return (
    <section className="cq-profile-xp cq-profile-fade-in" aria-label="Experience progress">
      <div className="cq-profile-xp-head">
        <span className="cq-profile-xp-level font-display">Level {character.level}</span>
        <span className="cq-profile-xp-total tabular-nums">{totalXp.toLocaleString()} XP</span>
      </div>

      <div
        className="cq-profile-xp-track"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-label={`${current} of ${needed} XP toward level ${character.level + 1}`}
      >
        <div className="cq-profile-xp-fill" style={{ width: `${pct}%` }}>
          <span className="cq-profile-xp-shimmer" aria-hidden />
        </div>
      </div>

      <p className="cq-profile-xp-caption tabular-nums">
        {current.toLocaleString()} / {needed.toLocaleString()} XP to Level {character.level + 1}
        <span className="cq-profile-xp-remaining"> · {remaining.toLocaleString()} to go</span>
      </p>
    </section>
  );
}
