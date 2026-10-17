"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True when `ref` intersects the viewport (with optional rootMargin).
 * Used to defer image/video network work until media is near the feed viewport.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  opts?: {
    rootMargin?: string;
    threshold?: number | number[];
    /** When true, start as near (first paint / priority posts). */
    initialNear?: boolean;
    disabled?: boolean;
  },
): boolean {
  const initialNear = opts?.initialNear === true;
  const disabled = opts?.disabled === true;
  const [near, setNear] = useState(initialNear || disabled);

  useEffect(() => {
    if (disabled) {
      setNear(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setNear(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: opts?.rootMargin ?? "200px 0px",
        threshold: opts?.threshold ?? 0.01,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, disabled, opts?.rootMargin, opts?.threshold]);

  return near;
}
