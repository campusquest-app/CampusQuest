"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { StatIcon } from "@/components/stats/StatIcon";

export type XPGainBannerProps = {
  title: string;
  xpGained?: number;
  /** Alias for xpGained (existing call sites) */
  xp?: number;
  activityLabel?: string;
  visible: boolean;
  stats?: Partial<Record<StatKey, number>>;
  primaryStat?: StatKey;
  modifierLines?: { label: string; emoji?: string }[];
  onDismiss: () => void;
  className?: string;
};

/**
 * Top activity-logged strip shown after the RPG XP overlay completes.
 */
export function XPGainBanner({
  title,
  xpGained,
  xp,
  activityLabel,
  visible,
  stats = {},
  primaryStat,
  modifierLines,
  onDismiss,
  className,
}: XPGainBannerProps) {
  const xpDisplay = xpGained ?? xp ?? 0;
  const statEntries = STAT_KEYS.filter((k) => (stats as Record<string, number>)[k] > 0);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className={`toast-enter w-full ${className ?? ""}`}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-uri-keaney/50 bg-gradient-to-br from-uri-navy via-[#071a38] to-uri-navy px-3 py-3.5 shadow-[0_0_0_1px_rgba(104,171,232,0.15),0_12px_40px_-8px_rgba(2,6,23,0.85),0_0_48px_-12px_rgba(56,189,248,0.35)] sm:px-4">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl"
              aria-hidden
            />
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-1.5 top-1.5 z-[1] rounded-lg px-2 py-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80 sm:right-2 sm:top-2"
              aria-label="Dismiss"
            >
              ✕
            </button>

            <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-8 pb-0.5 pt-1 text-center sm:px-10">
              <div className="font-display text-xs font-bold uppercase tracking-[0.12em] text-sky-200/90">
                Activity logged!
              </div>
              <div className="mt-1 w-full text-balance text-base font-semibold leading-snug text-white">{title}</div>
              {activityLabel ? (
                <p className="mt-1 text-xs text-cyan-200/75">{activityLabel}</p>
              ) : null}
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
                  +{xpDisplay} XP
                </span>
                {statEntries.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center justify-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/90"
                  >
                    <StatIcon stat={k} variant="glyph" size="sm" />
                    {" "}+{((stats as Record<string, number>)[k])} {STAT_LABELS[k]}
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
                      {l.emoji ? `${l.emoji} ` : ""}
                      {l.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
