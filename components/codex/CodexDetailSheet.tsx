"use client";

import { createPortal } from "react-dom";
import type { CodexItemState } from "@/lib/codexState";
import {
  CODEX_RARITY_LABELS,
  CODEX_SOURCE_META,
} from "@/lib/codexCatalog";

function formatEarnedDate(ts: number | null): string {
  if (!ts || Number.isNaN(ts)) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CodexDetailSheet({
  state,
  onClose,
}: {
  state: CodexItemState;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const { entry, discovered, earnedAt, whereEarned, isEquipped, equipEffect } = state;
  const sourceMeta = CODEX_SOURCE_META[entry.source];
  const displayName = discovered || !entry.hiddenUntilFound ? entry.name : "Undiscovered Relic";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={`cq-codex-detail relative z-10 w-full max-w-sm rounded-t-2xl border border-white/10 bg-uri-navy p-5 shadow-2xl sm:rounded-2xl cq-codex-detail--${entry.rarity}`}
      >
        <div
          className={`cq-codex-detail-icon mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border text-5xl ${
            discovered ? "" : "cq-codex-card-icon--locked"
          }`}
        >
          {discovered ? entry.icon : <span className="cq-codex-silhouette text-4xl">?</span>}
        </div>

        <h3 className="text-center font-display text-lg font-bold text-white">{displayName}</h3>
        <p className={`cq-codex-rarity-pill cq-codex-rarity-pill--${entry.rarity} mx-auto mt-2 w-fit`}>
          {CODEX_RARITY_LABELS[entry.rarity]}
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Description</dt>
            <dd className="mt-1 text-white/80">{discovered ? entry.description : entry.obtainHint}</dd>
          </div>
          {discovered ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Lore</dt>
              <dd className="mt-1 text-white/65 leading-relaxed">{entry.lore}</dd>
            </div>
          ) : (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">How to discover</dt>
              <dd className="mt-1 text-cyan-200/85 leading-relaxed">{entry.obtainHint}</dd>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Category</dt>
              <dd className="mt-1 font-medium text-white/80">{entry.categoryLabel}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Source</dt>
              <dd className="mt-1 font-medium text-white/80">
                {sourceMeta.icon} {sourceMeta.label}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Where earned</dt>
              <dd className="mt-1 font-medium text-white/80">{whereEarned ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Date earned</dt>
              <dd className="mt-1 font-medium text-white/80">
                {discovered ? formatEarnedDate(earnedAt) : "—"}
              </dd>
            </div>
          </div>
          {equipEffect ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Equip effect</dt>
              <dd className="mt-1 text-emerald-200/90">{equipEffect}</dd>
            </div>
          ) : null}
          {isEquipped ? (
            <p className="text-center text-xs font-semibold text-uri-gold">Currently equipped</p>
          ) : null}
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
