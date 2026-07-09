"use client";

import { useEffect, useState } from "react";

/**
 * One shared ticking clock (default 30s) for countdown UI.
 * Mount once per surface and pass the value down — never per marker.
 */
export function useNow(intervalMs = 30_000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return undefined;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
