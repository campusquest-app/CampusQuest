import { useCallback, useRef } from "react";

const TAP_MAX_MS = 700;
const TAP_MAX_PX = 14;

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
