import { useCallback, useRef } from "react";

const TAP_MAX_MS = 700;
/** Finger jitter on phones often exceeds 14px without being a pan. */
const TAP_MAX_PX = 18;
/** How long to ignore Google Maps background clicks after a marker tap. */
export const MAP_MARKER_CLICK_SUPPRESS_MS = 450;

type TapState = {
  x: number;
  y: number;
  t: number;
  handled: boolean;
};

export function shouldFireMapMarkerTap(
  start: Pick<TapState, "x" | "y" | "t">,
  end: { x: number; y: number; now?: number },
): boolean {
  const now = end.now ?? Date.now();
  const dt = now - start.t;
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  return dt <= TAP_MAX_MS && dist <= TAP_MAX_PX;
}

/**
 * Suppresses map-background clicks that Google Maps still emits after a
 * marker OverlayView tap (DOM stopPropagation does not cancel Maps API clicks).
 */
export function createMapClickSuppressor(durationMs = MAP_MARKER_CLICK_SUPPRESS_MS) {
  let until = 0;
  return {
    suppress(now = Date.now()) {
      until = Math.max(until, now + durationMs);
    },
    isSuppressed(now = Date.now()) {
      return now < until;
    },
    /** Test helper */
    reset() {
      until = 0;
    },
  };
}

export function useMapMarkerTap(onTap: () => void, disabled = false) {
  const tapRef = useRef<TapState>({ x: 0, y: 0, t: 0, handled: false });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (disabled) return;
      tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), handled: false };
    },
    [disabled],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (disabled) return;
      const state = tapRef.current;
      if (state.handled) return;
      if (shouldFireMapMarkerTap(state, { x: e.clientX, y: e.clientY })) {
        state.handled = true;
        onTap();
      }
    },
    [disabled, onTap],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      if (tapRef.current.handled) {
        tapRef.current.handled = false;
        return;
      }
      onTap();
    },
    [disabled, onTap],
  );

  return { onPointerDown, onPointerUp, onClick };
}
