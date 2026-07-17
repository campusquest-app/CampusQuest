"use client";

import { useEffect, useRef } from "react";

/**
 * Compact floating banner: “N opportunities around you”.
 * Shown once per map-open session; dismiss via tap or swipe.
 */
export function RealmOpportunitiesBanner({
  visible,
  copy,
  onDismiss,
}: {
  visible: boolean;
  copy: string | null;
  onDismiss: () => void;
}) {
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  if (!visible || !copy) return null;

  return (
    <button
      type="button"
      className="cq-realm-opportunities-banner touch-manipulation"
      onClick={onDismiss}
      onTouchStart={(event) => {
        startY.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const endY = event.changedTouches[0]?.clientY;
        if (startY.current != null && endY != null && startY.current - endY > 28) {
          onDismiss();
        }
        startY.current = null;
      }}
      aria-live="polite"
    >
      <span className="cq-realm-opportunities-banner-dot" aria-hidden />
      <span className="cq-realm-opportunities-banner-text">{copy}</span>
    </button>
  );
}
