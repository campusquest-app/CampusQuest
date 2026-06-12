"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  isGestureTargetBlocked,
  isInputFocused,
  readTouchMobileDevice,
  SWIPE_BACK_COMMIT_PX,
  SWIPE_BACK_EDGE_PX,
  SWIPE_GESTURE_AXIS_LOCK_PX,
  SWIPE_TRANSITION_MS,
  type GestureBlockKind,
} from "@/lib/client/mobileGestures";

type GestureState = {
  tracking: boolean;
  decided: boolean;
  isBack: boolean;
  startX: number;
  startY: number;
};

export function useSwipeBack({
  onBack,
  enabled = true,
  containerRef,
}: {
  onBack: () => void;
  enabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragXRef = useRef(0);
  const onBackRef = useRef(onBack);
  const gestureRef = useRef<GestureState>({
    tracking: false,
    decided: false,
    isBack: false,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  useEffect(() => {
    if (!enabled || !readTouchMobileDevice()) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;

    function resetGesture() {
      gestureRef.current = {
        tracking: false,
        decided: false,
        isBack: false,
        startX: 0,
        startY: 0,
      };
      setDragging(false);
    }

    function commitBack() {
      const width = root?.getBoundingClientRect().width ?? window.innerWidth;
      setDragging(false);
      setDragX(width);
      dragXRef.current = width;
      window.setTimeout(() => {
        onBackRef.current();
        setDragX(0);
        dragXRef.current = 0;
        resetGesture();
      }, SWIPE_TRANSITION_MS);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      if (isInputFocused()) return;
      if (isGestureTargetBlocked(event.target, new Set<GestureBlockKind>(["swipe-back", "all"]))) return;

      const touch = event.touches[0];
      if (touch.clientX > SWIPE_BACK_EDGE_PX) return;

      gestureRef.current = {
        tracking: true,
        decided: false,
        isBack: false,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const state = gestureRef.current;
      if (!state.tracking || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (!state.decided) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_GESTURE_AXIS_LOCK_PX) {
          resetGesture();
          return;
        }
        if (dx > SWIPE_GESTURE_AXIS_LOCK_PX && dx > Math.abs(dy)) {
          state.decided = true;
          state.isBack = true;
        } else if (dx < -SWIPE_GESTURE_AXIS_LOCK_PX) {
          resetGesture();
          return;
        } else {
          return;
        }
      }

      if (!state.isBack || dx <= 0) return;

      const width = root?.getBoundingClientRect().width ?? window.innerWidth;
      const next = Math.min(dx, width * 0.92);
      setDragging(true);
      setDragX(next);
      dragXRef.current = next;
      if (event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      const state = gestureRef.current;
      if (!state.isBack) {
        resetGesture();
        setDragX(0);
        dragXRef.current = 0;
        return;
      }

      const width = root?.getBoundingClientRect().width ?? window.innerWidth;
      const current = dragXRef.current;
      const shouldCommit = current >= SWIPE_BACK_COMMIT_PX || current > width * 0.28;
      if (shouldCommit) {
        commitBack();
        return;
      }

      resetGesture();
      setDragX(0);
      dragXRef.current = 0;
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [containerRef, enabled]);

  return { dragX, dragging, transitionMs: SWIPE_TRANSITION_MS };
}
