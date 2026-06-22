"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/lib/types";
import { getTodaysXpForStreak } from "@/lib/store";
import { todayString } from "@/lib/dateUtils";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import {
  formatStreakTitle,
  hasStreakFreezeAvailable,
  shouldShowStreakDanger,
  streakProtectionLine,
  streakSubtitle,
  streakXpProgressLine,
  STREAK_DANGER_BODY,
  STREAK_DANGER_TITLE,
  STREAK_FREEZE_LABEL,
} from "@/lib/streakMessaging";

export function StreakCard({ character }: { character: Character }) {
  const [serverStreakDays, setServerStreakDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthed<MeProfileRow>("/api/me/profile")
      .then((profile) => {
        if (!cancelled) {
          setServerStreakDays(Number(profile.streak_days ?? 0));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerStreakDays(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [character.id]);

  const days = serverStreakDays ?? character.streakDays ?? 0;
  const hasStreak = days > 0;
  const streakFreezes = character.streakFreezes ?? 0;

  const { todayXp, showDanger } = useMemo(() => {
    const today = todayString();
    const xp = getTodaysXpForStreak(character.id, character, today);
    return {
      todayXp: xp,
      showDanger: shouldShowStreakDanger(days, xp),
    };
  }, [character, days]);

  const fireScale = 1 + Math.min(0.5, Math.max(days, 1) * 0.03);

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
      <div className="relative flex items-start gap-3">
        <span className="text-3xl cq-streak-emoji" aria-hidden style={{ transform: `scale(${fireScale})` }}>
          🔥
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="font-semibold text-cq-foreground text-lg">{formatStreakTitle(days)}</div>
            <div className="text-sm text-cq-muted mt-0.5">{streakSubtitle(days, todayXp)}</div>
          </div>

          <div className="text-sm font-medium text-uri-keaney/95">{streakXpProgressLine(todayXp)}</div>
          <div className="text-xs text-cq-muted">{streakProtectionLine(days, todayXp)}</div>

          {hasStreakFreezeAvailable(streakFreezes) ? (
            <div className="rounded-lg border border-sky-300/25 bg-sky-400/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100">
              {STREAK_FREEZE_LABEL}
            </div>
          ) : null}

          {showDanger ? (
            <div
              className="rounded-lg border border-amber-300/35 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-100"
              role="status"
            >
              <p className="font-semibold">{STREAK_DANGER_TITLE}</p>
              <p className="mt-0.5 text-amber-100/90">{STREAK_DANGER_BODY}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
