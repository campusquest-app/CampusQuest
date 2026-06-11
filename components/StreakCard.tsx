"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/lib/types";
import { getTodaysXpForStreak } from "@/lib/store";
import { DAILY_MINIMUM_XP } from "@/lib/level";
import { todayString } from "@/lib/dateUtils";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";

export function StreakCard({ character }: { character: Character }) {
  const [serverStreakDays, setServerStreakDays] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState<"backend" | "local fallback">("local fallback");

  useEffect(() => {
    let cancelled = false;
    void fetchAuthed<MeProfileRow>("/api/me/profile")
      .then((profile) => {
        if (!cancelled) {
          setServerStreakDays(Number(profile.streak_days ?? 0));
          setSourceLabel("backend");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerStreakDays(null);
          setSourceLabel("local fallback");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [character.id]);

  const days = serverStreakDays ?? character.streakDays ?? 0;
  const hasStreak = days > 0;

  const { todayXp, atRisk } = useMemo(() => {
    const today = todayString();
    const xp = getTodaysXpForStreak(character.id, character, today);
    const risk = hasStreak && xp < DAILY_MINIMUM_XP;
    return { todayXp: xp, atRisk: risk };
  }, [character, hasStreak]);

  const fireScale = 1 + Math.min(0.5, days * 0.03);

  return (
    <div
      className={`card px-4 py-4 relative overflow-hidden ${hasStreak ? "border-uri-gold/40 streak-glow" : ""}`}
    >
      {hasStreak && (
        <div
          className="pointer-events-none absolute -right-4 -top-4 text-8xl opacity-[0.12] streak-flame-float"
          style={{ transform: `scale(${fireScale})` }}
          aria-hidden
        >
          🔥
        </div>
      )}
      <div className="relative flex items-center gap-3">
        <span className="text-3xl cq-streak-emoji" aria-hidden style={{ transform: `scale(${fireScale})` }}>
          🔥
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-cq-foreground text-lg">{days}-day streak</div>
          <div className="text-xs text-cq-muted mt-0.5">
            {hasStreak ? "Keep logging to extend your streak." : "Earn 20+ XP per day to start a streak."}
          </div>
          <div className="text-[11px] text-uri-keaney font-mono mt-2">
            Today: {todayXp}/{DAILY_MINIMUM_XP} XP toward streak credit
          </div>
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-1 text-[10px] font-mono text-slate-400">streak source: {sourceLabel}</div>
          )}
          {atRisk && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 font-semibold flex items-center gap-2">
              <span aria-hidden>⚠️</span>
              Streak at risk — log an activity with proof before midnight (or use a Streak Freeze drop).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
