"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { postAuthed } from "@/lib/client/dashboardApi";

const STORAGE_KEY = "cq:last-activity-ping";
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Throttled heartbeat while the authenticated app shell is in use. */
export function recordUserActivityPing(): void {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;

  const lastPing = Number(sessionStorage.getItem(STORAGE_KEY) || "0");
  const now = Date.now();
  if (Number.isFinite(lastPing) && now - lastPing < MIN_INTERVAL_MS) return;

  sessionStorage.setItem(STORAGE_KEY, String(now));
  void postAuthed<{ success: boolean; updated: boolean }, Record<string, never>>("/api/me/activity", {}).catch(() => {
    // Ignore heartbeat failures; meaningful server actions still record activity.
  });
}
