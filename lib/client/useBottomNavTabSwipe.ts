"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { AppBottomNavTab } from "@/components/AppBottomNav";
import {
  getAdjacentBottomNavTab,
  isGestureTargetBlocked,
  isGlobalTabSwipeBlocked,
  isInputFocused,
  readTouchMobileDevice,
  SWIPE_BACK_EDGE_PX,
  SWIPE_GESTURE_AXIS_LOCK_PX,
  SWIPE_TAB_COMMIT_PX,
  SWIPE_TRANSITION_MS,
  type SwipeNavDirection,
  type GestureBlockKind,
} from "@/lib/client/mobileGestures";

type TabGestureState = {
  tracking: boolean;
  decided: boolean;
  direction: SwipeNavDirection | null;
  startX: number;
  startY: number;
};

export function useBottomNavTabSwipe({
  activeTab,
  onTabChange,
  disabled = false,
  containerRef,
}: {
  activeTab: AppBottomNavTab | null;
  onTabChange: (tab: AppBottomNavTab, direction: SwipeNavDirection) => void;
  disabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const onTabChangeRef = useRef(onTabChange);
  const gestureRef = useRef<TabGestureState>({
    tracking: false,
    decided: false,
    direction: null,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    onTabChangeRef.current = onTabChange;
  }, [onTabChange]);

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    if (disabled || !activeTab || !readTouchMobileDevice()) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;

    function resetGesture() {
      gestureRef.current = {
        tracking: false,
        decided: false,
        direction: null,
        startX: 0,
        startY: 0,
      };
      setDragging(false);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      if (isInputFocused()) return;
      if (isGlobalTabSwipeBlocked()) return;
      if (isGestureTargetBlocked(event.target, new Set<GestureBlockKind>(["swipe-tab", "all"]))) return;

      const touch = event.touches[0];
      if (activeTabRef.current === "quad" && touch.clientX <= SWIPE_BACK_EDGE_PX) {
        return;
      }
      gestureRef.current = {
        tracking: true,
        decided: false,
        direction: null,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const state = gestureRef.current;
      if (!state.tracking || event.touches.length !== 1) return;
      if (isGlobalTabSwipeBlocked()) {
        resetGesture();
        setDragOffset(0);
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      const tab = activeTabRef.current;
      if (!tab) return;

      if (!state.decided) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_GESTURE_AXIS_LOCK_PX) {
          resetGesture();
          return;
        }
        if (Math.abs(dx) > SWIPE_GESTURE_AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          state.decided = true;
          state.direction = dx < 0 ? "forward" : "back";
        } else {
          return;
        }
      }

      if (!state.direction) return;

      const adjacent = getAdjacentBottomNavTab(tab, state.direction);
      if (!adjacent) {
        setDragOffset(state.direction === "forward" ? Math.max(dx, -48) * 0.35 : Math.min(dx, 48) * 0.35);
        return;
      }

      const width = root?.getBoundingClientRect().width ?? window.innerWidth;
      const clamped =
        state.direction === "forward"
          ? Math.max(dx, -width * 0.92)
          : Math.min(dx, width * 0.92);

      setDragging(true);
      setDragOffset(clamped);
      dragOffsetRef.current = clamped;
      if (event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      const state = gestureRef.current;
      const tab = activeTabRef.current;
      if (!state.decided || !state.direction || !tab) {
        resetGesture();
        setDragOffset(0);
        return;
      }

      const adjacent = getAdjacentBottomNavTab(tab, state.direction);
      const width = root?.getBoundingClientRect().width ?? window.innerWidth;
      const offset = dragOffsetRef.current;
      const traveled = state.direction === "forward" ? -offset : offset;
      const shouldCommit = adjacent != null && traveled >= SWIPE_TAB_COMMIT_PX;

      if (shouldCommit && adjacent) {
        const exitOffset = state.direction === "forward" ? -width : width;
        setDragging(false);
        setDragOffset(exitOffset);
        window.setTimeout(() => {
          onTabChangeRef.current(adjacent, state.direction as SwipeNavDirection);
          setDragOffset(0);
          resetGesture();
        }, SWIPE_TRANSITION_MS);
        return;
      }

      resetGesture();
      setDragOffset(0);
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
  }, [activeTab, containerRef, disabled]);

  return { dragOffset, dragging, transitionMs: SWIPE_TRANSITION_MS };
}
