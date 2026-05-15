"use client";

import type { StatKey } from "@/lib/types";
import { STAT_ICONS, STAT_KEYS, STAT_LABELS } from "@/lib/types";

export type XPGainBannerProps = {
  title: string;
  xp: number;
  stats: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  modifierLines?: { label: string; emoji?: string }[];
  onDismiss: () => void;
  /** Extra class on outer wrapper (fixed positioning lives in parent) */
  className?: string;
};

/**
 * Top “Activity logged” strip — RPG-polished card; all copy is column-centered.
 */
export function XPGainBanner({
  title,
  xp,
  stats,
  primaryStat,
  modifierLines,
  onDismiss,
  className,
}: XPGainBannerProps) {
  const statEntries = STAT_KEYS.filter((k) => (stats as Record<string, number>)[k] > 0);

  return (
    <div className={`toast-enter w-full ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-2xl border border-uri-keaney/50 bg-gradient-to-br from-uri-navy via-[#071a38] to-uri-navy px-3 py-3.5 shadow-[0_0_0_1px_rgba(104,171,232,0.15),0_12px_40px_-8px_rgba(2,6,23,0.85),0_0_48px_-12px_rgba(56,189,248,0.35)] sm:px-4">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl"
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-8 w-48 -translate-x-1/2 bg-uri-keaney/10 blur-xl" aria-hidden />
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-1.5 top-1.5 z-[1] rounded-lg px-2 py-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80 sm:right-2 sm:top-2"
          aria-label="Dismiss"
        >
          ✕
        </button>

        {/* Equal horizontal inset so headline + body read visually centered (dismiss floats in corner) */}
        <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-8 pb-0.5 pt-1 text-center sm:px-10">
          <div className="font-display text-xs font-bold uppercase tracking-[0.12em] text-sky-200/90">Activity logged!</div>

          <div className="mt-1 w-full text-balance text-base font-semibold leading-snug text-white">{title}</div>

          <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/70">
            <span
              className={`font-mono text-sm font-bold cq-xp-burst ${
                primaryStat === "strength"
                  ? "stat-burst-strength text-amber-300"
                  : primaryStat === "knowledge"
                    ? "stat-burst-knowledge text-sky-300"
                    : "text-uri-keaney"
              }`}
            >
              +{xp} XP
            </span>
            {statEntries.map((k) => (
              <span
                key={k}
                className="inline-flex items-center justify-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/90"
              >
                {STAT_ICONS[k]} +{(stats as Record<string, number>)[k]} {STAT_LABELS[k]}
              </span>
            ))}
          </div>

          {modifierLines && modifierLines.length > 0 && (
            <ul className="mt-2.5 flex w-full flex-col items-center gap-1.5" role="list">
              {modifierLines.map((l, i) => (
                <li
                  key={`${l.label}-${i}`}
                  className="inline-flex max-w-full justify-center rounded-full border border-uri-gold/35 bg-uri-gold/15 px-3 py-1 text-center text-[10px] font-semibold leading-tight text-uri-gold"
                >
                  <span className="text-center">
                    {l.emoji ? `${l.emoji} ` : ""}
                    {l.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
