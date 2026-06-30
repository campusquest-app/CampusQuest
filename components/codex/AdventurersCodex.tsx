"use client";

import { useMemo, useState } from "react";
import type { Character } from "@/lib/types";
import {
  CODEX_FILTER_CHIPS,
  CODEX_RARITY_LABELS,
  CODEX_RARITY_ORDER,
  CODEX_SUBTITLE,
  CODEX_TITLE,
  matchesCodexFilter,
  type CodexFilter,
} from "@/lib/codexCatalog";
import { buildCodexStates, computeCodexStats } from "@/lib/codexState";
import { CodexCard } from "@/components/codex/CodexCard";
import { CodexDetailSheet } from "@/components/codex/CodexDetailSheet";

export function AdventurersCodex({ character }: { character: Character }) {
  const [filter, setFilter] = useState<CodexFilter | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const states = useMemo(() => buildCodexStates(character), [character]);
  const stats = useMemo(() => computeCodexStats(states), [states]);

  const filtered = useMemo(
    () => states.filter((s) => matchesCodexFilter(s.entry, filter)),
    [states, filter],
  );

  const selected = selectedId ? states.find((s) => s.entry.id === selectedId) : null;

  return (
    <div className="cq-codex pb-6">
      <header className="cq-codex-header px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="cq-codex-emblem flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-xl">
            📖
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-black uppercase tracking-[0.2em] text-white sm:text-lg">
              {CODEX_TITLE}
            </h2>
            <p className="text-[11px] font-medium text-cyan-200/75">{CODEX_SUBTITLE}</p>
          </div>
        </div>

        <div className="cq-codex-stats mt-4 grid grid-cols-3 gap-2">
          <div className="cq-codex-stat rounded-xl border border-white/10 bg-black/20 px-2 py-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Score</p>
            <p className="mt-0.5 font-display text-lg font-bold text-cyan-200">{stats.collectionScore}</p>
          </div>
          <div className="cq-codex-stat rounded-xl border border-white/10 bg-black/20 px-2 py-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Discovered</p>
            <p className="mt-0.5 font-display text-lg font-bold text-white">
              {stats.discoveredCount}
              <span className="text-sm font-medium text-white/40">/{stats.totalCount}</span>
            </p>
          </div>
          <div className="cq-codex-stat rounded-xl border border-white/10 bg-black/20 px-2 py-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Complete</p>
            <p className="mt-0.5 font-display text-lg font-bold text-uri-gold">{stats.completionPct}%</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="cq-codex-progress h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="cq-codex-progress-fill h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-uri-gold transition-all duration-500"
              style={{ width: `${stats.completionPct}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {CODEX_RARITY_ORDER.map((rarity) => {
            const row = stats.byRarity[rarity];
            if (row.total === 0) return null;
            return (
              <span
                key={rarity}
                className={`cq-codex-rarity-pill cq-codex-rarity-pill--${rarity} text-[9px]`}
              >
                {CODEX_RARITY_LABELS[rarity]} {row.discovered}/{row.total}
              </span>
            );
          })}
        </div>
      </header>

      <div className="cq-codex-filters sticky top-0 z-10 border-y border-white/8 bg-uri-navy/95 px-4 py-2.5 backdrop-blur-md">
        <div className="cq-codex-filters-track">
          {CODEX_FILTER_CHIPS.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(active ? null : chip.id)}
                className={`cq-codex-filter-chip ${active ? "cq-codex-filter-chip--active" : ""}`}
                aria-pressed={active}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cq-codex-grid px-3 pt-3">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/50">No entries match this filter.</p>
        ) : (
          filtered.map((state) => (
            <CodexCard
              key={state.entry.id}
              state={state}
              character={character}
              onSelect={() => setSelectedId(state.entry.id)}
            />
          ))
        )}
      </div>

      {selected ? (
        <CodexDetailSheet state={selected} character={character} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
