"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const PTR_PULL_THRESHOLD = 68;
export const PTR_MAX_PULL = 108;
const TOP_SCROLL_TOLERANCE = 2;

function readScrollTop(root: Window | HTMLElement): number {
  if (root !== window) {
    return root.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export type UsePullToRefreshOptions = {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  scrollRootRef?: RefObject<HTMLElement | null>;
};

export function usePullToRefresh({ onRefresh, disabled = false, scrollRootRef }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshLockRef = useRef(false);
  const pullDistanceRef = useRef(0);

  const getScrollRoot = useCallback((): Window | HTMLElement => {
    return scrollRootRef?.current ?? window;
  }, [scrollRootRef]);

  const atScrollTop = useCallback(() => {
    return readScrollTop(getScrollRoot()) <= TOP_SCROLL_TOLERANCE;
  }, [getScrollRoot]);

  const triggerRefresh = useCallback(async () => {
    if (disabled || refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshing(true);
    setPullDistance(PTR_PULL_THRESHOLD);
    pullDistanceRef.current = PTR_PULL_THRESHOLD;
    try {
      await onRefresh();
    } catch (error) {
      console.error("[cq][pull-to-refresh] refresh failed", error);
    } finally {
      setRefreshing(false);
      setPullDistance(0);
      pullDistanceRef.current = 0;
      pullingRef.current = false;
      refreshLockRef.current = false;
    }
  }, [disabled, onRefresh]);

  useEffect(() => {
    if (disabled) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshLockRef.current) return;
      if (!atScrollTop()) return;
      if (event.touches.length !== 1) return;
      startYRef.current = event.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshLockRef.current) return;
      if (!atScrollTop()) {
        pullingRef.current = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }
      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }
      const next = Math.min(PTR_MAX_PULL, delta * 0.55);
      pullDistanceRef.current = next;
      setPullDistance(next);
      if (next > 10 && event.cancelable) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullDistanceRef.current >= PTR_PULL_THRESHOLD && !refreshLockRef.current) {
        void triggerRefresh();
        return;
      }
      setPullDistance(0);
      pullDistanceRef.current = 0;
    };

    let mousePulling = false;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || refreshLockRef.current) return;
      if (!atScrollTop()) return;
      mousePulling = true;
      startYRef.current = event.clientY;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!mousePulling || refreshLockRef.current) return;
      if (!atScrollTop()) {
        mousePulling = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }
      const delta = event.clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }
      const next = Math.min(PTR_MAX_PULL, delta * 0.55);
      pullDistanceRef.current = next;
      setPullDistance(next);
    };

    const onMouseUp = () => {
      if (!mousePulling) return;
      mousePulling = false;
      if (pullDistanceRef.current >= PTR_PULL_THRESHOLD && !refreshLockRef.current) {
        void triggerRefresh();
        return;
      }
      setPullDistance(0);
      pullDistanceRef.current = 0;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [atScrollTop, disabled, triggerRefresh]);

  const progress = refreshing ? 1 : Math.min(1, pullDistance / PTR_PULL_THRESHOLD);
  const indicatorVisible = pullDistance > 4 || refreshing;
  const label = refreshing ? "Refreshing…" : progress >= 1 ? "Release to refresh" : "Pull to refresh";

  return {
    pullDistance,
    refreshing,
    indicatorVisible,
    progress,
    label,
  };
}
