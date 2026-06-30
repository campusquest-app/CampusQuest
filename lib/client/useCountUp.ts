"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animate a number from its previous value up to `target` over `durationMs`.
 * Used for premium counter animations on profile stats / XP. Respects
 * reduced-motion (snaps instantly) and never animates below 60fps cost — it
 * uses a single rAF loop and stops as soon as the target is reached.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || durationMs <= 0) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return undefined;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic for a smooth, premium settle.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + delta * eased);
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return value;
}
