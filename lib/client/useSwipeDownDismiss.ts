"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  isInputFocused,
  isInteractiveElement,
  readTouchMobileDevice,
  SWIPE_GESTURE_AXIS_LOCK_PX,
  SWIPE_TRANSITION_MS,
} from "@/lib/client/mobileGestures";

/** Drag distance (px) past which release dismisses the sheet. */
const DISMISS_DISTANCE_PX = 120;
/** Downward velocity (px/ms) that dismisses regardless of distance (flick). */
const DISMISS_VELOCITY_PX_MS = 0.55;
/** Minimum travel for a velocity-only flick to count (avoids accidental taps). */
const FLICK_MIN_DISTANCE_PX = 24;

type DismissGestureState = {
  tracking: boolean;
  decided: boolean;
  isDown: boolean;
  startX: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
};

/** Nearest ancestor (up to `root`) that can scroll vertically right now. */
function findVerticalScrollAncestor(start: EventTarget | null, root: Element | null): Element | null {
  if (!(start instanceof Element)) return null;
  let node: Element | null = start;
  while (node && node !== root) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Pull-down-to-dismiss for a full-screen sheet. The gesture only engages when the
 * touch starts at the top of the content (so inner vertical scrolling keeps working)
 * and is vertical (so horizontal carousels/image swipes are untouched).
 *
 * Drag offset updates are batched with requestAnimationFrame so the panel tracks
 * the finger smoothly on iOS Safari without layout thrash.
 */
export function useSwipeDownDismiss({
  onDismiss,
  enabled = true,
  containerRef,
}: {
  onDismiss: () => void;
  enabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragYRef = useRef(0);
  const pendingYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  const gestureRef = useRef<DismissGestureState>({
    tracking: false,
    decided: false,
    isDown: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    dragYRef.current = dragY;
  }, [dragY]);

  // Block map panning while the sheet is being dragged down.
  useEffect(() => {
    if (!dragging) {
      document.documentElement.removeAttribute("data-realm-sheet-dragging");
      return undefined;
    }
    document.documentElement.setAttribute("data-realm-sheet-dragging", "true");
    return () => {
      document.documentElement.removeAttribute("data-realm-sheet-dragging");
    };
  }, [dragging]);

  useEffect(() => {
    if (!enabled || !readTouchMobileDevice()) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;

    function flushDragY() {
      rafRef.current = null;
      const next = pendingYRef.current;
      dragYRef.current = next;
      setDragY(next);
    }

    function scheduleDragY(next: number) {
      pendingYRef.current = next;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(flushDragY);
    }

    function resetGesture() {
      gestureRef.current = {
        tracking: false,
        decided: false,
        isDown: false,
        startX: 0,
        startY: 0,
        lastY: 0,
        lastTime: 0,
        velocity: 0,
      };
      setDragging(false);
    }

    function commitDismiss() {
      const height = root?.getBoundingClientRect().height ?? window.innerHeight;
      setDragging(false);
      scheduleDragY(height);
      window.setTimeout(() => {
        onDismissRef.current();
        scheduleDragY(0);
        resetGesture();
      }, SWIPE_TRANSITION_MS);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      if (isInputFocused()) return;
      if (isInteractiveElement(event.target)) return;

      const touch = event.touches[0];
      const state = gestureRef.current;
      const scrollable = findVerticalScrollAncestor(event.target, root);
      const atTop = !scrollable || scrollable.scrollTop <= 0;

      state.tracking = true;
      state.decided = !atTop;
      state.isDown = false;
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.lastY = touch.clientY;
      state.lastTime = performance.now();
      state.velocity = 0;
    }

    function onTouchMove(event: TouchEvent) {
      const state = gestureRef.current;
      if (!state.tracking || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      const now = performance.now();
      const dt = now - state.lastTime;
      if (dt > 0) state.velocity = (touch.clientY - state.lastY) / dt;
      state.lastY = touch.clientY;
      state.lastTime = now;

      if (!state.decided) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_GESTURE_AXIS_LOCK_PX) {
          resetGesture();
          return;
        }
        if (dy > SWIPE_GESTURE_AXIS_LOCK_PX && dy > Math.abs(dx)) {
          state.decided = true;
          state.isDown = true;
        } else if (dy < -SWIPE_GESTURE_AXIS_LOCK_PX) {
          resetGesture();
          return;
        } else {
          return;
        }
      }

      if (!state.isDown) return;

      const next = Math.max(0, dy);
      setDragging(true);
      scheduleDragY(next);
      if (next > SWIPE_GESTURE_AXIS_LOCK_PX && event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      const state = gestureRef.current;
      if (!state.isDown) {
        resetGesture();
        if (dragYRef.current !== 0) {
          scheduleDragY(0);
        }
        return;
      }

      const distance = dragYRef.current;
      const flick = state.velocity > DISMISS_VELOCITY_PX_MS && distance > FLICK_MIN_DISTANCE_PX;
      if (distance > DISMISS_DISTANCE_PX || flick) {
        commitDismiss();
        return;
      }

      resetGesture();
      scheduleDragY(0);
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
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerRef, enabled]);

  const progress = Math.min(1, dragY / (DISMISS_DISTANCE_PX * 2));

  return { dragY, dragging, progress, transitionMs: SWIPE_TRANSITION_MS };
}
