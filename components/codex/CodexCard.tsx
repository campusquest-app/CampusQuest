"use client";

import type { CodexItemState } from "@/lib/codexState";
import { CODEX_RARITY_LABELS } from "@/lib/codexCatalog";

type CodexCardProps = {
  state: CodexItemState;
  onSelect: () => void;
};

export function CodexCard({ state, onSelect }: CodexCardProps) {
  const { entry, discovered, isEquipped } = state;
  const showSilhouette = !discovered;
  const displayName =
    discovered || !entry.hiddenUntilFound ? entry.name : "???";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cq-codex-card cq-codex-card--${entry.rarity} group relative flex flex-col items-center gap-1.5 p-2 text-center transition active:scale-[0.97] ${
        isEquipped ? "cq-codex-card--equipped" : ""
      }`}
      aria-label={`${displayName}, ${CODEX_RARITY_LABELS[entry.rarity]}${discovered ? "" : ", undiscovered"}`}
    >
      <div
        className={`cq-codex-card-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-2xl sm:h-12 sm:w-12 sm:text-[1.65rem] ${
          showSilhouette ? "cq-codex-card-icon--locked" : ""
        }`}
      >
        {showSilhouette ? (
          <span className="cq-codex-silhouette text-xl sm:text-2xl" aria-hidden>
            ?
          </span>
        ) : (
          <span aria-hidden>{entry.icon}</span>
        )}
      </div>
      <span
        className={`line-clamp-2 w-full text-[10px] font-semibold leading-tight sm:text-[11px] ${
          discovered ? "text-white" : "text-white/45"
        }`}
      >
        {displayName}
      </span>
      <span className={`cq-codex-rarity-pill cq-codex-rarity-pill--${entry.rarity}`}>
        {CODEX_RARITY_LABELS[entry.rarity]}
      </span>
      {isEquipped ? (
        <span className="absolute right-1 top-1 rounded bg-uri-gold/25 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-100">
          On
        </span>
      ) : null}
    </button>
  );
}
