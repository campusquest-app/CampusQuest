"use client";

import { useEffect, useState } from "react";

/**
 * Current time that re-renders on an interval and immediately when the app returns to the foreground,
 * regains focus, or comes back online — so open/closed states are never stale after a resume.
 */
export function useLiveClock(intervalMs = 30_000, initial?: Date): Date {
  const [now, setNow] = useState<Date>(() => initial ?? new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    window.addEventListener("online", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
      window.removeEventListener("online", tick);
    };
  }, [intervalMs]);

  return now;
}
