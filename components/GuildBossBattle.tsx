"use client";

import { useMemo } from "react";
import type { Character } from "@/lib/types";
import { getGuildById } from "@/lib/guildStore";
import { getCharacterById } from "@/lib/friendsStore";
import {
  getGuildBossDisplayEntry,
  guildBossPercentHp,
  guildBossTopContributors,
  type GuildBossEntry,
} from "@/lib/guildBossEvent";

function GuildBossCard({
  guildId,
  guildLabel,
  entry,
  characterId,
}: {
  guildId: string;
  guildLabel: string;
  entry: GuildBossEntry;
  characterId: string;
}) {
  const pctRemaining = guildBossPercentHp(entry);
  const damagedPct = Math.max(0, Math.min(100, 100 - pctRemaining));
  const top = guildBossTopContributors(entry, 5);

  return (
    <div className="rounded-xl border border-violet-400/25 bg-gradient-to-b from-violet-950/40 to-black/25 p-3 shadow-inner sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 gap-y-2">
        <p className="min-w-0 max-w-full flex-1 basis-[min(100%,12rem)] font-display text-base font-bold leading-snug text-white [overflow-wrap:anywhere] break-words sm:text-base">
          {entry.name}
        </p>
        <span className="flex-shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
          {guildLabel}
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="h-5 min-h-[1.25rem] w-full min-w-0 overflow-hidden rounded-full border border-white/15 bg-black/50 shadow-inner sm:h-5">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 transition-all duration-500"
            style={{ width: `${damagedPct}%` }}
          />
        </div>
        <div className="flex flex-col gap-1 font-mono text-xs text-white/60 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between sm:text-[11px] sm:text-white/55">
          <span>Guild raid {damagedPct.toFixed(1)}%</span>
          <span className="text-white/50 min-[380px]:text-inherit">~{pctRemaining.toFixed(1)}% HP left</span>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-violet-400/20 bg-black/20 p-2.5 sm:p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-200/90 sm:text-[10px]">
          Top strikers
        </p>
        <ol className="space-y-1.5">
          {top.length === 0 ? (
            <li className="text-[13px] leading-relaxed text-white/50 sm:text-xs sm:text-white/45">
              Log activities while in this guild — damage stacks here and in the weekly race.
            </li>
          ) : (
            top.map((t, i) => {
              const c = getCharacterById(t.userId);
              const label = t.userId === characterId ? "You" : c?.name ?? t.userId.slice(0, 8);
              return (
                <li
                  key={t.userId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[13px] text-white/90 sm:text-xs"
                >
                  <span className="min-w-0 leading-snug">
                    <span className="mr-1.5 font-mono text-white/40">{i + 1}.</span>
                    <span className="break-words">{label}</span>
                  </span>
                  <span className="flex-shrink-0 font-mono text-sm text-violet-200 tabular-nums sm:text-xs">
                    {t.damage.toLocaleString()}
                  </span>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </div>
  );
}

export function GuildBossBattle({
  character,
  embedded = false,
}: {
  character: Character;
  embedded?: boolean;
}) {
  const guildIds = useMemo(() => character.guildIds ?? [], [character.guildIds]);

  const cards = useMemo(() => {
    return guildIds.map((gid) => {
      const g = getGuildById(gid);
      const entry = getGuildBossDisplayEntry(gid);
      const guildLabel = g?.name ?? "Guild";
      return { guildId: gid, guildLabel, entry };
    });
  }, [guildIds]);

  const inner =
    guildIds.length === 0 ? (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] py-8 text-center sm:py-10">
        <p className="text-sm text-white/60">No guild yet — join one to unlock guild battle.</p>
        <p className="mt-2 px-3 text-xs text-white/45">
          Open <strong className="text-white/70">Guilds</strong> from the menu. Your logs will chip this boss down and fuel the weekly guild race.
        </p>
      </div>
    ) : (
      <div className={`space-y-4 ${guildIds.length > 1 ? "sm:space-y-4" : ""}`}>
        {cards.map(({ guildId, guildLabel, entry }) => (
          <GuildBossCard
            key={guildId}
            guildId={guildId}
            guildLabel={guildLabel}
            entry={entry}
            characterId={character.id}
          />
        ))}
      </div>
    );

  if (embedded) {
    return <div className="space-y-4 sm:space-y-4">{inner}</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-violet-400/40 bg-gradient-to-b from-violet-950/30 to-uri-navy/90">
      <div className="flex items-center gap-3 border-b border-violet-400/25 px-4 py-3">
        <span className="text-xl" aria-hidden>
          🛡️
        </span>
        <div>
          <h4 className="font-display text-sm font-bold text-white">Guild battle</h4>
          <p className="text-[10px] text-white/55">Per-guild raid boss — resets each Monday with the campus raid.</p>
        </div>
      </div>
      <div className="space-y-4 p-4">{inner}</div>
    </div>
  );
}
