"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMediaGestureLock } from "@/lib/client/useMediaGestureLock";
import {
  IDENTITY_TRANSFORM,
  PINCH_RESET_MS,
  computePinchScale,
  computePinchTransform,
  distanceBetween,
  formatPinchTransformCss,
  midpointBetween,
  pinchPhaseRaisesLayer,
  shouldSuppressClickAfterPinch,
  type PinchPoint,
  type PinchTransform,
  type TemporaryPinchPhase,
} from "@/lib/client/temporaryPinchZoom";

type PointerSample = PinchPoint & { id: number };

const DOC_PINCH_ATTR = "data-cq-media-pinching";

function bumpDocumentPinch(delta: number) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const current = Number(root.getAttribute(DOC_PINCH_ATTR) || "0");
  const next = Math.max(0, current + delta);
  if (next <= 0) root.removeAttribute(DOC_PINCH_ATTR);
  else root.setAttribute(DOC_PINCH_ATTR, String(next));
}

export type TemporaryPinchSurfaceProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** When false, gestures are ignored (offscreen carousel slide). */
  interactive?: boolean;
  /** When false, parent owns {@link useMediaGestureLock}. Default true. */
  lockGestures?: boolean;
  /** Coarse active signal (pinching or resetting) for carousel lock / overflow. */
  onActiveChange?: (active: boolean) => void;
  /** Live scale for callers that still key off zoom amount. */
  onScaleChange?: (scale: number) => void;
  /** Fired for a clean tap (not after a pinch). */
  onClick?: () => void;
};

/**
 * Instagram-style temporary pinch zoom surface.
 * Transform applies only while two fingers are down; release always animates to identity.
 */
export function TemporaryPinchSurface({
  children,
  className = "",
  style,
  interactive = true,
  lockGestures: _lockGestures = true,
  onActiveChange,
  onScaleChange,
  onClick,
}: TemporaryPinchSurfaceProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const { acquire, release } = useMediaGestureLock();
  void _lockGestures;

  const pointersRef = useRef<Map<number, PointerSample>>(new Map());
  const phaseRef = useRef<TemporaryPinchPhase>("idle");
  const transformRef = useRef<PinchTransform>({ ...IDENTITY_TRANSFORM });
  const pinchStartRef = useRef<{
    distance: number;
    mid: PinchPoint;
    bounds: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const didPinchRef = useRef(false);
  const docPinchHeldRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<TemporaryPinchPhase>("idle");

  const publishActive = useCallback(
    (next: TemporaryPinchPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onActiveChange?.(pinchPhaseRaisesLayer(next));
    },
    [onActiveChange],
  );

  const applyTransform = useCallback(
    (next: PinchTransform, withTransition: boolean) => {
      transformRef.current = next;
      const layer = layerRef.current;
      if (!layer) return;
      if (withTransition) {
        layer.style.transition = `transform ${PINCH_RESET_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      } else {
        layer.style.transition = "none";
      }
      layer.style.transform = formatPinchTransformCss(next);
      onScaleChange?.(next.scale);
    },
    [onScaleChange],
  );

  const scheduleTransform = useCallback(
    (next: PinchTransform) => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyTransform(next, false);
      });
    },
    [applyTransform],
  );

  const holdDocumentPinch = useCallback((hold: boolean) => {
    if (hold === docPinchHeldRef.current) return;
    docPinchHeldRef.current = hold;
    bumpDocumentPinch(hold ? 1 : -1);
  }, []);

  const acquireIfNeeded = useCallback(() => {
    acquire();
  }, [acquire]);

  const releaseIfNeeded = useCallback(() => {
    release();
  }, [release]);

  const finishReset = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    applyTransform(IDENTITY_TRANSFORM, false);
    holdDocumentPinch(false);
    publishActive("idle");
    releaseIfNeeded();
    // Keep didPinchRef true briefly so a trailing click is ignored.
    window.setTimeout(() => {
      if (phaseRef.current === "idle") didPinchRef.current = false;
    }, 320);
  }, [applyTransform, holdDocumentPinch, publishActive, releaseIfNeeded]);

  const beginReset = useCallback(() => {
    if (phaseRef.current === "resetting") return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pointersRef.current.clear();
    pinchStartRef.current = null;
    publishActive("resetting");
    applyTransform(IDENTITY_TRANSFORM, true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      finishReset();
    }, PINCH_RESET_MS + 16);
  }, [applyTransform, finishReset, publishActive]);

  const beginPinch = useCallback(() => {
    const points = Array.from(pointersRef.current.values());
    if (points.length < 2) return;
    const root = rootRef.current;
    if (!root) return;
    const [a, b] = points;
    const mid = midpointBetween(a, b);
    const bounds = root.getBoundingClientRect();
    pinchStartRef.current = {
      distance: Math.max(1, distanceBetween(a, b)),
      mid,
      bounds: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
    };
    didPinchRef.current = true;
    acquireIfNeeded();
    holdDocumentPinch(true);
    publishActive("pinching");
    applyTransform(IDENTITY_TRANSFORM, false);
  }, [acquireIfNeeded, applyTransform, holdDocumentPinch, publishActive]);

  const updatePinch = useCallback(() => {
    const start = pinchStartRef.current;
    if (!start) return;
    const points = Array.from(pointersRef.current.values());
    if (points.length < 2) return;
    const [a, b] = points;
    const dist = Math.max(1, distanceBetween(a, b));
    const mid = midpointBetween(a, b);
    const scale = computePinchScale(dist, start.distance);
    const next = computePinchTransform({
      scale,
      initialMidpoint: start.mid,
      currentMidpoint: mid,
      bounds: start.bounds,
    });
    scheduleTransform(next);
  }, [scheduleTransform]);

  // Offscreen / unmount cleanup — never leave scale > 1.
  useEffect(() => {
    if (!interactive && phaseRef.current !== "idle") {
      beginReset();
    }
  }, [interactive, beginReset]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      holdDocumentPinch(false);
      release();
    };
  }, [holdDocumentPinch, release]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && phaseRef.current !== "idle") {
        beginReset();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [beginReset]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;

    const target = event.target as HTMLElement | null;
    if (target?.closest?.("[data-cq-media-control='true']")) return;

    if (phaseRef.current === "resetting") {
      // Interrupt reset and restart clean if user pinches again quickly.
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      applyTransform(IDENTITY_TRANSFORM, false);
      publishActive("idle");
    }

    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    try {
      rootRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (pointersRef.current.size >= 2) {
      beginPinch();
      event.preventDefault();
      event.stopPropagation();
    }
    // Single finger: do not stopPropagation — carousel / feed scroll own it.
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });

    if (phaseRef.current === "pinching" && pointersRef.current.size >= 2) {
      updatePinch();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const endPointer = (event: React.PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    try {
      rootRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (phaseRef.current === "pinching") {
      // Instagram: fewer than two fingers ends the zoom immediately.
      if (pointersRef.current.size < 2) {
        beginReset();
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
  };

  const raised = pinchPhaseRaisesLayer(phase);
  const touchAction = !interactive || raised ? "none" : "pan-y";

  return (
    <div
      ref={rootRef}
      className={`cq-temporary-pinch ${raised ? "cq-temporary-pinch--active" : ""} ${className}`.trim()}
      style={{ ...style, touchAction }}
      data-cq-zoomable="true"
      data-cq-pinching={raised ? "true" : "false"}
      data-cq-zoomed={raised ? "true" : "false"}
      data-cq-pinch-phase={phase}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={(event) => {
        if (shouldSuppressClickAfterPinch(didPinchRef.current)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.();
      }}
    >
      {raised ? <div className="cq-temporary-pinch-dim" aria-hidden /> : null}
      <div ref={layerRef} className="cq-temporary-pinch-layer">
        {children}
      </div>
    </div>
  );
}
