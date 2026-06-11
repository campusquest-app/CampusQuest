"use client";

import type { Character } from "@/lib/types";
import { StreakCard } from "./StreakCard";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import { RecentActivities } from "./RecentActivities";

export function ProgressHubScreen({ character }: { character: Character }) {
  return (
    <div className="cq-tab-shell mx-auto w-full max-w-lg space-y-6 pb-8">
      <header className="cq-screen-header">
        <p className="cq-screen-header__eyebrow">Your Journey</p>
        <h1 className="cq-screen-header__title">My Progress</h1>
        <p className="cq-screen-header__subtitle">Streaks, weekly recap, and your recent campus activity.</p>
      </header>

      <div className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm" aria-hidden>
            ⚡
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-uri-gold/95">Quick stats</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-cq-border bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-cq-muted">Level</div>
            <div className="mt-0.5 font-display text-lg font-bold text-uri-keaney sm:text-xl">{character.level}</div>
          </div>
          <div className="rounded-xl border border-cq-border bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-cq-muted">Streak</div>
            <div className="mt-0.5 font-display text-lg font-bold text-cq-foreground sm:text-xl">{character.streakDays}d</div>
          </div>
          <div className="rounded-xl border border-cq-border bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-cq-muted">XP</div>
            <div className="mt-0.5 truncate font-mono text-sm font-bold text-uri-keaney/95 sm:text-base">
              {character.totalXP.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <StreakCard character={character} />
      <WeeklyRecapCard character={character} />
      <RecentActivities characterId={character.id} />
    </div>
  );
}
