"use client";

import { useEffect, useRef, useState } from "react";
import { xpProgressInLevel } from "@/lib/level";

export function TopNavLevelProgress({
  level,
  totalXP,
}: {
  level: number;
  totalXP: number;
}) {
  const prevXpRef = useRef(totalXP);
  const [xpPulse, setXpPulse] = useState(false);
  const { current, needed } = xpProgressInLevel(totalXP);
  const pct = needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 0;

  useEffect(() => {
    if (totalXP === prevXpRef.current) return;
    prevXpRef.current = totalXP;
    setXpPulse(true);
    const timer = window.setTimeout(() => setXpPulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [totalXP]);

  return (
    <div
      className="cq-nav-level-strip mt-0.5 w-full max-w-[9.25rem]"
      aria-label={`Level ${level}, ${current} of ${needed} experience points toward next level`}
    >
      <div className="flex items-baseline justify-between gap-1.5 leading-none">
        <span className="cq-nav-level-label font-display text-[9px] font-semibold tracking-[0.08em] text-cyan-200/55">
          Level {level}
        </span>
        <span className="text-[8px] font-medium tabular-nums tracking-wide text-white/28">
          {current.toLocaleString()} / {needed.toLocaleString()}
        </span>
      </div>
      <div className="cq-nav-level-track relative mt-1 h-[3px] overflow-hidden rounded-full">
        <div
          className={`cq-nav-level-fill h-full rounded-full ${xpPulse ? "cq-nav-level-fill--pulse" : ""}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={needed}
          aria-label={`${pct}% to next level`}
        />
      </div>
    </div>
  );
}
