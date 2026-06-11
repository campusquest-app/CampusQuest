"use client";

import { useMemo } from "react";
import type { Character } from "@/lib/types";
import { getActivityLogs } from "@/lib/store";
import { getActivityById } from "@/lib/activities";
import { getEarnedAchievements } from "@/lib/achievementEngine";
import { RARITY_CSS } from "@/lib/achievementRarityStyles";
import { formatProfileTime } from "./profilePostUtils";

type ActivityItem = {
  id: string;
  ts: number;
  icon: string;
  title: string;
  subtitle?: string;
  accent?: "xp" | "quest" | "achievement" | "event";
};

function buildActivityFeed(character: Character): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const log of getActivityLogs(character.id)) {
    const def = getActivityById(log.activityId);
    const isQrLog = log.tags?.[0] === "cq-qr";
    const qrLabel = isQrLog ? log.tags?.[1]?.trim() : "";
    const label = qrLabel || def?.label || log.activityId;
    items.push({
      id: `log-${log.id}`,
      ts: log.createdAt,
      icon: "⚡",
      title: label,
      subtitle: log.xpEarned ? `+${log.xpEarned} XP` : log.minutes ? `${log.minutes} min` : undefined,
      accent: "xp",
    });
  }

  for (const view of getEarnedAchievements(character)) {
    if (!view.earnedAt) continue;
    items.push({
      id: `ach-${view.def.id}`,
      ts: new Date(view.earnedAt).getTime(),
      icon: view.def.icon,
      title: view.def.name,
      subtitle: "Achievement unlocked",
      accent: "achievement",
    });
  }

  return items.sort((a, b) => b.ts - a.ts).slice(0, 50);
}

const ACCENT_CLASS: Record<NonNullable<ActivityItem["accent"]>, string> = {
  xp: "text-uri-keaney",
  quest: "text-emerald-600",
  achievement: "text-uri-gold",
  event: "text-uri-purple",
};

export function ProfileActivityTab({ character }: { character: Character }) {
  const items = useMemo(() => buildActivityFeed(character), [character]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-4xl" aria-hidden>
          ◎
        </span>
        <p className="mt-3 font-display text-base font-semibold text-white">No activity yet</p>
        <p className="mt-1 max-w-xs text-sm text-white/60">Log campus activities and complete quests to build your timeline.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-cq-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-3 py-3.5">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cq-elevated text-lg" aria-hidden>
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-cq-foreground">{item.title}</p>
            {item.subtitle ? (
              <p className={`mt-0.5 text-sm font-semibold ${ACCENT_CLASS[item.accent ?? "xp"]}`}>{item.subtitle}</p>
            ) : null}
          </div>
          <time className="flex-shrink-0 text-xs text-cq-subtle" dateTime={new Date(item.ts).toISOString()}>
            {formatProfileTime(item.ts)}
          </time>
        </li>
      ))}
    </ul>
  );
}
