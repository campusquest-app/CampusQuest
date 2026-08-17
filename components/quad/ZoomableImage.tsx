"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaGestureLock } from "@/lib/client/useMediaGestureLock";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;

type PointerSample = { id: number; x: number; y: number };

function distance(a: PointerSample, b: PointerSample): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function midpoint(a: PointerSample, b: PointerSample): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type ZoomableImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** When false, image is display-only (e.g. offscreen carousel slide). */
  interactive?: boolean;
  /** When false, parent owns {@link useMediaGestureLock}. Default true. */
  lockGestures?: boolean;
  /** When false, double-tap does not toggle zoom (parent may use double-tap for like). Default true. */
  enableDoubleTapZoom?: boolean;
  onClick?: () => void;
  onZoomChange?: (scale: number) => void;
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
};

/**
 * Pinch-to-zoom + pan photo. Owns two-finger pinch and one-finger pan while zoomed.
 * At 1x, one-finger horizontal gestures bubble to the parent carousel.
 */
export function ZoomableImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  interactive = true,
  lockGestures = true,
  enableDoubleTapZoom = true,
  onClick,
  onZoomChange,
  onError,
}: ZoomableImageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { acquire, release } = useMediaGestureLock();
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pointersRef = useRef<Map<number, PointerSample>>(new Map());
  const modeRef = useRef<"none" | "pan" | "pinch">("none");
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const pinchStartRef = useRef({
    distance: 1,
    scale: 1,
    midX: 0,
    midY: 0,
    tx: 0,
    ty: 0,
  });
  const lastTapRef = useRef(0);
  const movedRef = useRef(false);

  const publish = useCallback(
    (nextScale: number, nextTx: number, nextTy: number) => {
      const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      let x = nextTx;
      let y = nextTy;
      if (s <= MIN_SCALE + 0.001) {
        x = 0;
        y = 0;
      } else {
        const root = rootRef.current;
        if (root) {
          const rect = root.getBoundingClientRect();
          const maxX = ((s - 1) * rect.width) / 2 + 24;
          const maxY = ((s - 1) * rect.height) / 2 + 24;
          x = clamp(x, -maxX, maxX);
          y = clamp(y, -maxY, maxY);
        }
      }
      scaleRef.current = s;
      txRef.current = x;
      tyRef.current = y;
      setScale(s);
      setTx(x);
      setTy(y);
      onZoomChange?.(s);
    },
    [onZoomChange],
  );

  const resetZoom = useCallback(() => {
    publish(1, 0, 0);
  }, [publish]);

  const shouldLockRef = useRef(lockGestures);
  shouldLockRef.current = lockGestures;

  const acquireIfNeeded = useCallback(
    (force = false) => {
      if (force || shouldLockRef.current) acquire();
    },
    [acquire],
  );

  const releaseIfNeeded = useCallback(() => {
    // Always safe: useMediaGestureLock is idempotent and only unlocks if this instance held.
    release();
  }, [release]);

  useEffect(() => {
    // Reset when slide becomes non-interactive (scrolled away).
    if (!interactive && scaleRef.current !== 1) {
      resetZoom();
    }
  }, [interactive, resetZoom]);

  useEffect(() => {
    return () => release();
  }, [release]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!interactive) return;

    const sample = { id: event.pointerId, x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, sample);
    try {
      rootRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    movedRef.current = false;

    const points = Array.from(pointersRef.current.values());
    if (points.length >= 2) {
      modeRef.current = "pinch";
      acquireIfNeeded(true);
      const [a, b] = points;
      const mid = midpoint(a, b);
      pinchStartRef.current = {
        distance: Math.max(1, distance(a, b)),
        scale: scaleRef.current,
        midX: mid.x,
        midY: mid.y,
        tx: txRef.current,
        ty: tyRef.current,
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (scaleRef.current > 1.01) {
      modeRef.current = "pan";
      acquireIfNeeded(true);
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        tx: txRef.current,
        ty: tyRef.current,
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (lockGestures) acquire();
    // At 1x single finger: do not stopPropagation so carousel can swipe.
    modeRef.current = "none";
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });

    const points = Array.from(pointersRef.current.values());
    if (points.length >= 2 || modeRef.current === "pinch") {
      if (points.length < 2) return;
      modeRef.current = "pinch";
      const [a, b] = points;
      const dist = Math.max(1, distance(a, b));
      const mid = midpoint(a, b);
      const start = pinchStartRef.current;
      const nextScale = clamp(start.scale * (dist / start.distance), MIN_SCALE, MAX_SCALE);
      const root = rootRef.current;
      const rect = root?.getBoundingClientRect();
      if (rect) {
        // Keep focal point under the pinch midpoint.
        const focalX = start.midX - rect.left - rect.width / 2;
        const focalY = start.midY - rect.top - rect.height / 2;
        const scaleRatio = nextScale / start.scale;
        const nextTx = mid.x - start.midX + focalX * (1 - scaleRatio) + start.tx * scaleRatio;
        const nextTy = mid.y - start.midY + focalY * (1 - scaleRatio) + start.ty * scaleRatio;
        publish(nextScale, nextTx, nextTy);
      } else {
        publish(nextScale, txRef.current, tyRef.current);
      }
      movedRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (modeRef.current === "pan" && scaleRef.current > 1.01) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      if (Math.hypot(dx, dy) > 2) movedRef.current = true;
      publish(scaleRef.current, panStartRef.current.tx + dx, panStartRef.current.ty + dy);
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

    if (pointersRef.current.size === 0) {
      const wasPinchOrPan = modeRef.current !== "none" || scaleRef.current > 1.01;
      modeRef.current = "none";
      releaseIfNeeded();

      if (!movedRef.current && wasPinchOrPan === false && scaleRef.current <= 1.01) {
        const now = Date.now();
        if (enableDoubleTapZoom && now - lastTapRef.current < DOUBLE_TAP_MS) {
          // Double-tap toggle zoom toward tap point.
          lastTapRef.current = 0;
          if (scaleRef.current > 1.01) {
            resetZoom();
          } else {
            const root = rootRef.current;
            const rect = root?.getBoundingClientRect();
            if (rect) {
              const focalX = event.clientX - rect.left - rect.width / 2;
              const focalY = event.clientY - rect.top - rect.height / 2;
              const target = 2;
              publish(target, -focalX * (target - 1), -focalY * (target - 1));
            } else {
              publish(2, 0, 0);
            }
          }
          return;
        }
        lastTapRef.current = now;
        onClick?.();
      } else if (scaleRef.current < 1.05) {
        resetZoom();
      }
    } else if (pointersRef.current.size === 1 && scaleRef.current > 1.01) {
      modeRef.current = "pan";
      const remaining = Array.from(pointersRef.current.values())[0];
      panStartRef.current = {
        x: remaining.x,
        y: remaining.y,
        tx: txRef.current,
        ty: tyRef.current,
      };
    }
  };

  const touchAction =
    !interactive ? "pan-y" : scale > 1.01 ? "none" : "pan-y";

  return (
    <div
      ref={rootRef}
      className={`cq-zoomable-image ${className}`.trim()}
      style={{ touchAction }}
      data-cq-zoomable="true"
      data-cq-zoomed={scale > 1.01 ? "true" : "false"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={() => {
        if (pointersRef.current.size === 0) releaseIfNeeded();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`cq-zoomable-image-img ${imgClassName}`.trim()}
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transformOrigin: "center center",
        }}
        onError={onError}
      />
    </div>
  );
}
