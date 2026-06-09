"use client";

import type { Character } from "@/lib/types";
import { StreakCard } from "./StreakCard";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import { RecentActivities } from "./RecentActivities";

export function ProgressHubScreen({ character }: { character: Character }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 pb-8">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">My Progress</h1>
        <p className="text-sm text-white/55">Streaks, recap, and your recent campus activity.</p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-cq-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm" aria-hidden>
            ⚡
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-uri-gold/95">Quick stats</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Level</div>
            <div className="mt-0.5 font-display text-lg font-bold text-uri-keaney sm:text-xl">{character.level}</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Streak</div>
            <div className="mt-0.5 font-display text-lg font-bold text-white sm:text-xl">{character.streakDays}d</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-cq-elevated px-2 py-2.5 text-center sm:px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/45">XP</div>
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
