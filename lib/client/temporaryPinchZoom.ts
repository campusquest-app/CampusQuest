/**
 * Pure helpers for Instagram-style temporary pinch-to-zoom.
 * Zoom exists only while two fingers are down; release always resets to identity.
 */

export const PINCH_MIN_SCALE = 1;
export const PINCH_MAX_SCALE = 4;
/** Spring-like snap-back duration (ms). */
export const PINCH_RESET_MS = 220;

export type TemporaryPinchPhase = "idle" | "pinching" | "resetting";

export type PinchPoint = { x: number; y: number };

export type PinchTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const IDENTITY_TRANSFORM: PinchTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export function distanceBetween(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpointBetween(a: PinchPoint, b: PinchPoint): PinchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clampPinchScale(scale: number): number {
  if (!Number.isFinite(scale)) return PINCH_MIN_SCALE;
  return Math.min(PINCH_MAX_SCALE, Math.max(PINCH_MIN_SCALE, scale));
}

/** Scale for the current gesture: distance ratio, clamped. Always starts from 1. */
export function computePinchScale(currentDistance: number, initialDistance: number): number {
  const base = Math.max(1, initialDistance);
  return clampPinchScale(currentDistance / base);
}

/**
 * Focal-point transform: scale around the initial pinch midpoint, then follow
 * midpoint movement so the image stays under the fingers.
 */
export function computePinchTransform(args: {
  scale: number;
  initialMidpoint: PinchPoint;
  currentMidpoint: PinchPoint;
  /** Element bounding rect at pinch start (viewport coords). */
  bounds: { left: number; top: number; width: number; height: number };
}): PinchTransform {
  const scale = clampPinchScale(args.scale);
  if (scale <= PINCH_MIN_SCALE + 0.0001) {
    return { ...IDENTITY_TRANSFORM };
  }

  const originX = args.initialMidpoint.x - args.bounds.left - args.bounds.width / 2;
  const originY = args.initialMidpoint.y - args.bounds.top - args.bounds.height / 2;
  const translateX = args.currentMidpoint.x - args.initialMidpoint.x + originX * (1 - scale);
  const translateY = args.currentMidpoint.y - args.initialMidpoint.y + originY * (1 - scale);

  return { scale, translateX, translateY };
}

export function formatPinchTransformCss(t: PinchTransform): string {
  return `translate3d(${t.translateX}px, ${t.translateY}px, 0) scale(${t.scale})`;
}

export function isIdentityTransform(t: PinchTransform): boolean {
  return (
    t.scale <= PINCH_MIN_SCALE + 0.001 &&
    Math.abs(t.translateX) < 0.5 &&
    Math.abs(t.translateY) < 0.5
  );
}

/** Second finger must cancel carousel / tab swipe ownership. */
export function shouldSuppressCarouselForPointerCount(pointerCount: number): boolean {
  return pointerCount >= 2;
}

/** After a real pinch, ignore the synthetic click/tap that follows. */
export function shouldSuppressClickAfterPinch(didPinch: boolean): boolean {
  return didPinch;
}

export function pinchPhaseAllowsCarousel(phase: TemporaryPinchPhase): boolean {
  return phase === "idle";
}

export function pinchPhaseRaisesLayer(phase: TemporaryPinchPhase): boolean {
  return phase === "pinching" || phase === "resetting";
}
