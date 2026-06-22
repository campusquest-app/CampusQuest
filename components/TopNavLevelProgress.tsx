"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Character } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { todayString } from "@/lib/dateUtils";
import { getTodaysXpForStreak } from "@/lib/store";
import {
  formatTopNavStreakLine,
  resolveTopNavStreakStatus,
} from "@/lib/streakMessaging";

export function TopNavLevelProgress({ character }: { character: Character }) {
  const prevXpRef = useRef(character.totalXP);
  const [xpPulse, setXpPulse] = useState(false);
  const { level, totalXP, streakDays } = character;
  const { current, needed } = xpProgressInLevel(totalXP);
  const pct = needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 0;

  const todayXp = useMemo(
    () => getTodaysXpForStreak(character.id, character, todayString()),
    [character],
  );

  const streakLine = useMemo(
    () => formatTopNavStreakLine(streakDays ?? 0, todayXp),
    [streakDays, todayXp],
  );

  const streakStatus = useMemo(
    () => resolveTopNavStreakStatus(streakDays ?? 0, todayXp),
    [streakDays, todayXp],
  );

  useEffect(() => {
    if (totalXP === prevXpRef.current) return;
    prevXpRef.current = totalXP;
    setXpPulse(true);
    const timer = window.setTimeout(() => setXpPulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [totalXP]);

  return (
    <div
      className="cq-nav-progress-strip"
      aria-label={`Level ${level}, ${current} of ${needed} experience points toward next level. ${streakLine}`}
    >
      <div className="cq-nav-progress-grid">
        <span className="cq-nav-level-label font-display shrink-0">
          <span className="hidden sm:inline">✦ Level {level}</span>
          <span className="sm:hidden">✦ Lvl {level}</span>
        </span>

        <div className="cq-nav-level-track cq-nav-progress-bar relative h-[3px] overflow-hidden rounded-full">
          <div
            className={`cq-nav-level-fill h-full rounded-full ${xpPulse ? "cq-nav-level-fill--pulse" : ""}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={0}
            aria-valuemax={needed}
            aria-label={`${pct}% to next level`}
          />
        </div>

        <span className="cq-nav-xp-label shrink-0 tabular-nums">
          {current.toLocaleString()}/{needed.toLocaleString()} XP
        </span>

        <span
          className={`cq-nav-streak-label shrink-0 ${
            streakStatus === "at_risk"
              ? "cq-nav-streak-label--at-risk"
              : streakStatus === "secured"
                ? "cq-nav-streak-label--secured"
                : ""
          }`}
        >
          {streakLine}
        </span>
      </div>
    </div>
  );
}
