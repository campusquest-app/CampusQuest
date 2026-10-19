"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmberCastOverlay } from "@/components/embers/EmberCastOverlay";
import { subscribeEmberCast, type EmberCastAnchor, type EmberCastEvent } from "@/lib/client/emberCastEvents";
import { planEmberCast, planUnlimitedEmberCast, type EmberCastPlan } from "@/lib/embers";

type ActiveCast = {
  key: number;
  plan: EmberCastPlan;
  anchor: EmberCastAnchor | null;
  noteId: string;
};

/**
 * Feed-level cast host. Post cards remount on optimistic updates; keeping
 * the overlay here prevents the three-flame spell from vanishing mid-flight.
 */
export function EmberCastHost() {
  const [cast, setCast] = useState<ActiveCast | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    return subscribeEmberCast((event: EmberCastEvent) => {
      keyRef.current += 1;
      setCast({
        key: keyRef.current,
        noteId: event.noteId,
        plan: event.unlimited ? planUnlimitedEmberCast() : planEmberCast(event.remainingAfter),
        anchor: event.anchor ?? null,
      });
    });
  }, []);

  const getAnchorRect = useCallback(() => {
    if (!cast) return null;
    if (cast.anchor) {
      const a = cast.anchor;
      return new DOMRect(a.left, a.top, a.width, a.height);
    }
    if (typeof document === "undefined") return null;
    return document.querySelector(`[data-cq-ember-anchor="${CSS.escape(cast.noteId)}"]`)?.getBoundingClientRect() ?? null;
  }, [cast]);

  const onComplete = useCallback(() => setCast(null), []);

  if (!cast || typeof document === "undefined") return null;

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return createPortal(
    <EmberCastOverlay
      key={cast.key}
      plan={cast.plan}
      reducedMotion={reducedMotion}
      getAnchorRect={getAnchorRect}
      onComplete={onComplete}
    />,
    document.body,
  );
}
