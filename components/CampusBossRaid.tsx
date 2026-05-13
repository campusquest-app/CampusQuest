"use client";

import { useMemo } from "react";
import type { Character } from "@/lib/types";
import { loadCampusBossEvent, campusBossPercentHp, topContributors } from "@/lib/campusBossEvent";
import { getCharacterById } from "@/lib/friendsStore";

export function CampusBossRaid({
  character,
  embedded = false,
}: {
  character: Character;
  /** When true, omit outer frame (parent section provides the chrome). */
  embedded?: boolean;
}) {
  const state = useMemo(() => loadCampusBossEvent(), []);
  const pctRemaining = campusBossPercentHp(state);
  const damagedPct = Math.max(0, Math.min(100, 100 - pctRemaining));
  const top = topContributors(state, 6);

  const inner = (
    <>
      <p className="px-1 text-center font-display text-lg font-bold leading-snug text-white [overflow-wrap:anywhere] break-words sm:text-lg">
        {state.name}
      </p>
      <div className="space-y-2.5 sm:space-y-2">
        <div className="h-5 min-h-[1.25rem] w-full min-w-0 overflow-hidden rounded-full border border-white/15 bg-black/50 shadow-inner sm:h-5">
          <div
            className="h-full bg-gradient-to-r from-uri-gold via-amber-400 to-orange-500 transition-all duration-500"
            style={{ width: `${damagedPct}%` }}
          />
        </div>
        <div className="flex flex-col gap-1 font-mono text-xs text-white/60 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between sm:text-[11px] sm:text-white/55">
          <span>Raid damage {damagedPct.toFixed(1)}%</span>
          <span className="text-white/50 min-[380px]:text-inherit">~{pctRemaining.toFixed(1)}% HP left</span>
        </div>
      </div>
      <div className="rounded-xl border border-uri-gold/25 bg-black/20 p-3 sm:p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-uri-gold/90 sm:text-[10px]">Top contributors</p>
        <ol className="space-y-2 sm:space-y-1.5">
          {top.length === 0 ? (
            <li className="text-[13px] leading-relaxed text-white/50 sm:text-xs sm:text-white/45">Log any activity — you&apos;ll show up here.</li>
          ) : (
            top.map((t, i) => {
              const c = getCharacterById(t.userId);
              const label = c?.name ?? t.userId.slice(0, 8);
              return (
                <li
                  key={t.userId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white/90 sm:px-2.5 sm:py-1.5 sm:text-xs"
                >
                  <span className="min-w-0 leading-snug">
                    <span className="mr-1.5 font-mono text-white/40">{i + 1}.</span>
                    <span className="break-words">{label}</span>
                  </span>
                  <span className="flex-shrink-0 font-mono text-sm text-uri-keaney tabular-nums sm:text-xs">{t.damage.toLocaleString()}</span>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4 sm:space-y-4">{inner}</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-uri-gold/50 bg-gradient-to-b from-uri-gold/10 to-uri-navy/90">
      <div className="flex items-center gap-3 border-b border-uri-gold/30 px-4 py-3">
        <span className="text-xl" aria-hidden>
          🌐
        </span>
        <div>
          <h4 className="font-display text-sm font-bold text-white">Campus-wide boss event</h4>
          <p className="text-[10px] text-white/55">Everyone&apos;s logs chip in. Resets each Monday.</p>
        </div>
      </div>
      <div className="space-y-4 p-4">{inner}</div>
    </div>
  );
}
