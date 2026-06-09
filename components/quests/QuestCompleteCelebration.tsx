"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { QuestCelebrationPayload } from "@/lib/questBoardActions";
import { dismissQuestCelebration, subscribeQuestCelebrations } from "@/lib/questBoardCelebration";
import { playQuestComplete } from "@/lib/playGameSound";

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 19) % 100}%`,
  delay: `${(i * 0.08) % 1.4}s`,
  color: ["#68abe8", "#fbbf24", "#34d399", "#a78bfa"][i % 4],
}));

export function QuestCompleteCelebration() {
  const [active, setActive] = useState<QuestCelebrationPayload | null>(null);

  useEffect(() => {
    return subscribeQuestCelebrations((payload) => {
      setActive(payload);
      playQuestComplete();
    });
  }, []);

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-quest-complete fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Quest complete">
      <div className="absolute inset-0 bg-black/88 backdrop-blur-sm" aria-hidden />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {CONFETTI.map((c) => (
          <span
            key={c.id}
            className="cq-quest-confetti absolute top-0 h-2 w-2 rounded-sm"
            style={{ left: c.left, backgroundColor: c.color, animationDelay: c.delay }}
          />
        ))}
      </div>

      <div className="cq-quest-complete-card relative z-10 w-full max-w-sm rounded-3xl border border-uri-gold/40 bg-gradient-to-b from-amber-500/20 via-uri-navy/95 to-black/90 p-8 text-center shadow-[0_0_40px_rgba(251,191,36,0.35)] ring-2 ring-amber-400/40">
        <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.35em] text-uri-gold">Quest Complete</p>
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/15 bg-black/35 text-5xl shadow-inner">
          {active.icon}
        </div>
        <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white">{active.questName}</h2>
        <p className="mt-3 text-lg font-bold text-uri-gold">+{active.xpReward.toLocaleString()} XP</p>
        {active.bonusXp ? (
          <p className="mt-1 text-sm font-semibold text-emerald-300">Chain bonus +{active.bonusXp.toLocaleString()} XP</p>
        ) : null}
        {active.badge ? (
          <p className="mt-4 rounded-xl border border-uri-keaney/35 bg-uri-keaney/10 px-3 py-2 text-xs font-semibold text-uri-keaney">
            Badge earned: {active.badge}
          </p>
        ) : null}
        {active.title ? (
          <p className="mt-2 rounded-xl border border-uri-gold/30 bg-uri-gold/10 px-3 py-2 text-xs font-semibold text-uri-gold">
            Title unlocked: {active.title}
          </p>
        ) : null}
        {active.chainComplete ? (
          <p className="mt-2 text-xs font-medium text-white/55">{active.chainComplete} — journey complete!</p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            dismissQuestCelebration();
            setActive(null);
          }}
          className="mt-7 w-full rounded-xl bg-uri-keaney py-3 text-sm font-bold text-white shadow-lg transition hover:bg-uri-keaney/90"
        >
          Continue Adventure
        </button>
      </div>
    </div>,
    document.body,
  );
}
