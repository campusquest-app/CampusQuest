"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampDrawerTranslateX,
  drawerOpenProgress,
  DRAWER_CLOSE_PROGRESS_THRESHOLD,
  DRAWER_OPEN_PROGRESS_THRESHOLD,
  DRAWER_VELOCITY_CLOSE_PX_MS,
  DRAWER_VELOCITY_OPEN_PX_MS,
  getDrawerWidth,
} from "@/lib/client/drawerGeometry";
import { isDrawerSwipeSuppressed, isInputFocused, readTouchMobileDevice, shouldIgnoreDrawerCloseSwipe, shouldIgnoreDrawerSwipe } from "@/lib/client/mobileGestures";

export function useDrawerSwipeGestures({
  open,
  onOpen,
  onClose,
  disabled = false,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [drawerWidth, setDrawerWidth] = useState(360);
  const [drawerTranslateX, setDrawerTranslateX] = useState(-360);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const [drawerOpenProgressValue, setDrawerOpenProgressValue] = useState(0);

  const openRef = useRef(open);
  const disabledRef = useRef(disabled);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const widthRef = useRef(360);
  const translateRef = useRef(-360);
  const draggingRef = useRef(false);

  const syncWidth = useCallback(() => {
    const width = getDrawerWidth();
    widthRef.current = width;
    setDrawerWidth(width);
    if (!draggingRef.current) {
      const next = openRef.current ? 0 : -width;
      translateRef.current = next;
      setDrawerTranslateX(next);
      setDrawerOpenProgressValue(drawerOpenProgress(next, width));
    }
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    syncWidth();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, [syncWidth]);

  useEffect(() => {
    if (draggingRef.current) return;
    const width = widthRef.current;
    const next = open ? 0 : -width;
    translateRef.current = next;
    setDrawerTranslateX(next);
    setDrawerOpenProgressValue(drawerOpenProgress(next, width));
  }, [open]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let tracking = false;
    let axisLocked = false;
    let startedOpen = false;
    let velocityX = 0;

    function applyTranslate(next: number) {
      const width = widthRef.current;
      const clamped = clampDrawerTranslateX(next, width);
      translateRef.current = clamped;
      setDrawerTranslateX(clamped);
      setDrawerOpenProgressValue(drawerOpenProgress(clamped, width));
    }

    function resetGesture() {
      tracking = false;
      axisLocked = false;
      startedOpen = false;
      velocityX = 0;
      startX = 0;
      startY = 0;
      lastX = 0;
      lastTime = 0;
      if (draggingRef.current) {
        draggingRef.current = false;
        setIsDraggingDrawer(false);
      }
    }

    function onTouchStart(event: TouchEvent) {
      if (!readTouchMobileDevice()) return;
      if (disabledRef.current) return;
      if (!event.touches || event.touches.length !== 1) return;
      if (isInputFocused()) return;

      const touch = event.touches[0];
      const target = event.target;
      const drawerOpen = openRef.current;

      // A full-screen overlay (e.g. the Memories viewer) owns all horizontal
      // swipes while mounted — never let the drawer open from underneath it.
      if (!drawerOpen && isDrawerSwipeSuppressed()) return;

      if (drawerOpen) {
        if (shouldIgnoreDrawerCloseSwipe(target)) return;
      } else if (shouldIgnoreDrawerSwipe(target)) {
        return;
      }

      startedOpen = drawerOpen;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      lastTime = performance.now();
      tracking = true;
      axisLocked = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking || !event.touches || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const width = widthRef.current;
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocityX = (touch.clientX - lastX) / dt;
      }
      lastX = touch.clientX;
      lastTime = now;

      if (!axisLocked) {
        if (Math.abs(dy) > Math.abs(dx) * 1.2) {
          resetGesture();
          return;
        }
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

        axisLocked = true;
        draggingRef.current = true;
        setIsDraggingDrawer(true);

        if (!startedOpen && dx < 0) {
          resetGesture();
          return;
        }
        if (startedOpen && dx > 0) {
          resetGesture();
          return;
        }
      }

      const base = startedOpen ? 0 : -width;
      applyTranslate(base + dx);
    }

    function onTouchEnd(event: TouchEvent) {
      if (!readTouchMobileDevice()) return;
      if (!tracking) return;
      if (!axisLocked) {
        resetGesture();
        return;
      }

      const width = widthRef.current;
      const translateX = translateRef.current;
      const progress = drawerOpenProgress(translateX, width);

      if (axisLocked && event.changedTouches?.[0]) {
        const touch = event.changedTouches[0];
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          velocityX = (touch.clientX - lastX) / dt;
        }
      }

      const shouldOpen =
        progress > DRAWER_OPEN_PROGRESS_THRESHOLD || velocityX > DRAWER_VELOCITY_OPEN_PX_MS;
      const shouldClose =
        progress < DRAWER_CLOSE_PROGRESS_THRESHOLD || velocityX < DRAWER_VELOCITY_CLOSE_PX_MS;

      resetGesture();

      if (startedOpen) {
        if (shouldClose) {
          onCloseRef.current();
          applyTranslate(-width);
        } else {
          if (!openRef.current) onOpenRef.current();
          applyTranslate(0);
        }
        return;
      }

      if (shouldOpen) {
        if (!openRef.current) onOpenRef.current();
        applyTranslate(0);
      } else {
        if (openRef.current) onCloseRef.current();
        applyTranslate(-width);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return {
    drawerWidth,
    drawerTranslateX,
    isDraggingDrawer,
    drawerOpenProgress: drawerOpenProgressValue,
  };
}
