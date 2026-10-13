"use client";

import { useEffect, useState } from "react";

const listeners = new Set<(now: Date) => void>();
let timer: number | null = null;

function ensureTimer() {
  if (timer != null || typeof window === "undefined") return;
  timer = window.setInterval(() => {
    const now = new Date();
    listeners.forEach((listener) => listener(now));
  }, 15_000);
}

/** One shared clock so event cards can show or hide live actions without a refresh. */
export function useLiveNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    listeners.add(setNow);
    ensureTimer();
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0 && timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return now;
}
