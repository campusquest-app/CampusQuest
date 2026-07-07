"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/lib/types";
import { getActivityLogs } from "@/lib/store";
import { getEarnedAchievements } from "@/lib/achievementEngine";
import { mergeActivityFeed } from "@/lib/activityFeed";
import { fetchMyActivityFeed } from "@/lib/client/activityFeedClient";
import { subscribeActivityFeedRefresh } from "@/lib/client/activityFeedRefresh";
import { isServerBackedUserId } from "@/lib/client/gameStateSync";
import { formatProfileTime } from "./profilePostUtils";

const ACCENT_CLASS = {
  xp: "text-uri-keaney",
  quest: "text-emerald-600",
  achievement: "text-uri-gold",
  event: "text-uri-purple",
  post: "text-cyan-300",
  memory: "text-sky-300",
} as const;

export function ProfileActivityTab({
  character,
  isOwner = true,
}: {
  character: Character;
  isOwner?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [serverEvents, setServerEvents] = useState<Awaited<ReturnType<typeof fetchMyActivityFeed>>>([]);

  useEffect(() => subscribeActivityFeedRefresh(() => setRefreshKey((k) => k + 1)), []);

  useEffect(() => {
    if (!isOwner || !isServerBackedUserId(character.id)) {
      setServerEvents([]);
      return;
    }
    let cancelled = false;
    void fetchMyActivityFeed(50)
      .then((events) => {
        if (!cancelled) setServerEvents(events);
      })
      .catch(() => {
        if (!cancelled) setServerEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [character.id, isOwner, refreshKey]);

  const items = useMemo(() => {
    const achievements = getEarnedAchievements(character)
      .filter((view) => view.earnedAt)
      .map((view) => ({
        id: view.def.id,
        ts: new Date(view.earnedAt!).getTime(),
        icon: view.def.icon,
        title: view.def.name,
      }));

    return mergeActivityFeed({
      localLogs: getActivityLogs(character.id),
      serverEvents: isOwner ? serverEvents : [],
      achievements,
      limit: 50,
    });
  }, [character, isOwner, refreshKey, serverEvents]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-4xl" aria-hidden>
          ◎
        </span>
        <p className="mt-3 font-display text-base font-semibold text-white">No activity yet</p>
        <p className="mt-1 max-w-xs text-sm text-white/60">
          Scan QR codes, complete quests, and log campus activities to build your timeline.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-cq-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-3 py-3.5">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cq-elevated text-lg"
            aria-hidden
          >
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
