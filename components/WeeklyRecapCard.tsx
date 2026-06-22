"use client";

import { useMemo } from "react";
import type { Character, StatKey } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS } from "@/lib/types";
import { StatIcon } from "@/components/stats/StatIcon";
import { getActivityLogs } from "@/lib/store";
import { getActivityById } from "@/lib/activities";
import { DAILY_MINIMUM_XP } from "@/lib/level";

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeeklyRecapCard({ character }: { character: Character }) {
  const recap = useMemo(() => {
    const logs = getActivityLogs(character.id);
    const now = Date.now();
    const start = now - 6 * 24 * 60 * 60 * 1000;
    const inWeek = logs.filter((l) => l.createdAt >= start);

    const totalXp = inWeek.reduce((sum, l) => sum + (l.xpEarned ?? 0), 0);

    const statTotals: Record<StatKey, number> = {
      strength: 0,
      stamina: 0,
      knowledge: 0,
      social: 0,
      focus: 0,
    };
    for (const l of inWeek) {
      if (l.qrStatContribution) {
        statTotals[l.qrStatContribution.stat] += l.qrStatContribution.gain;
        continue;
      }
      const def = getActivityById(l.activityId);
      if (!def) continue;
      const m = l.minutes ?? 0;
      let gain = def.statGain;
      if (def.usesMinutes && m > 0) {
        if (def.stat === "knowledge") gain = Math.max(1, Math.floor(m / 20));
        else if (def.stat === "focus") gain = Math.max(1, Math.floor(m / 25));
      }
      statTotals[def.stat] += gain;
    }
    const topStat = STAT_KEYS
      .map((k) => ({ k: k as StatKey, v: statTotals[k as StatKey] }))
      .sort((a, b) => b.v - a.v)[0];

    // Best streak in last 7 days based on daily minimum XP
    const dailyXp = new Map<string, number>();
    for (const l of inWeek) {
      const key = dayKey(l.createdAt);
      dailyXp.set(key, (dailyXp.get(key) ?? 0) + (l.xpEarned ?? 0));
    }
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      days.push(dayKey(now - i * 24 * 60 * 60 * 1000));
    }
    let best = 0;
    let cur = 0;
    for (const d of days) {
      if ((dailyXp.get(d) ?? 0) >= DAILY_MINIMUM_XP) {
        cur += 1;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }

    return {
      totalXp,
      topStat: topStat?.v ? topStat.k : null,
      topStatValue: topStat?.v ?? 0,
      bestStreak: best,
      activityCount: inWeek.length,
    };
  }, [character.id]);

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-uri-keaney/90 uppercase tracking-wider mb-3">
        Weekly recap
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-cq-secondary border border-cq-border p-3">
          <div className="text-cq-muted text-xs">XP (7d)</div>
          <div className="text-uri-keaney font-bold text-lg font-mono">+{recap.totalXp}</div>
          <div className="text-slate-400 text-xs">{recap.activityCount} logs</div>
        </div>
        <div className="rounded-xl bg-cq-secondary border border-cq-border p-3">
          <div className="text-cq-muted text-xs">Top stat (7d)</div>
          {recap.topStat ? (
            <>
              <div className="flex items-center gap-1.5 text-cq-foreground font-bold text-lg">
                <StatIcon stat={recap.topStat} size="sm" />
                {STAT_LABELS[recap.topStat]}
              </div>
              <div className="text-slate-400 text-xs font-mono">+{recap.topStatValue}</div>
            </>
          ) : (
            <div className="text-slate-400 text-sm">No activity yet</div>
          )}
        </div>
        <div className="rounded-xl bg-cq-secondary border border-cq-border p-3">
          <div className="text-cq-muted text-xs">Best streak (7d)</div>
          <div className="text-cq-foreground font-bold text-lg">{recap.bestStreak} day{recap.bestStreak === 1 ? "" : "s"}</div>
          <div className="text-slate-400 text-xs">{DAILY_MINIMUM_XP} XP daily keeps the flame alive</div>
        </div>
      </div>
    </section>
  );
}

