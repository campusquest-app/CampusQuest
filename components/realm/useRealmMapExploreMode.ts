"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  MAP_EXPLORE_ENGAGE_MS,
  MAP_EXPLORE_IDLE_MS,
  MAP_EXPLORE_MIN_DRAG_PX,
  MAP_EXPLORE_MIN_HEADING_DELTA,
  MAP_EXPLORE_MIN_TILT_DELTA,
  MAP_EXPLORE_MIN_ZOOM_DELTA,
  clearMapExploring,
  setMapExploring,
} from "@/lib/client/realmMapExploreMode";
import { hasUserMovedCamera } from "@/lib/realm/mapCameraGuard";

type CameraSnapshot = {
  zoom: number;
  tilt: number;
  heading: number;
  lat: number;
  lng: number;
};

/**
 * Immersive navigation mode: compact top chrome + bottom dock while the user
 * meaningfully explores the map; expand when idle or when UI needs focus.
 */
export function useRealmMapExploreMode(args: {
  enabled: boolean;
  /** Sheets, search focus, marker selection — force full chrome. */
  forceExpanded: boolean;
  surfaceRef: React.RefObject<HTMLElement | null>;
}): { expandChrome: () => void; noteMapInteraction: () => void } {
  const map = useMap();
  const exploringRef = useRef(false);
  const forceExpandedRef = useRef(args.forceExpanded);
  const idleTimerRef = useRef<number | null>(null);
  const engageTimerRef = useRef<number | null>(null);
  const gestureActiveRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const cameraBaselineRef = useRef<CameraSnapshot | null>(null);
  const mountedRef = useRef(true);
  const zoomSettleRef = useRef<number | null>(null);

  forceExpandedRef.current = args.forceExpanded;

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearEngage = useCallback(() => {
    if (engageTimerRef.current != null) {
      window.clearTimeout(engageTimerRef.current);
      engageTimerRef.current = null;
    }
  }, []);

  const setExploring = useCallback((next: boolean) => {
    if (!mountedRef.current) return;
    if (forceExpandedRef.current && next) return;
    if (exploringRef.current === next) return;
    exploringRef.current = next;
    setMapExploring(next);
  }, []);

  const expandChrome = useCallback(() => {
    clearIdle();
    clearEngage();
    gestureActiveRef.current = false;
    setExploring(false);
  }, [clearEngage, clearIdle, setExploring]);

  const scheduleIdleExpand = useCallback(() => {
    clearIdle();
    if (forceExpandedRef.current) {
      setExploring(false);
      return;
    }
    idleTimerRef.current = window.setTimeout(() => {
      if (!gestureActiveRef.current) setExploring(false);
    }, MAP_EXPLORE_IDLE_MS);
  }, [clearIdle, setExploring]);

  const noteMapInteraction = useCallback(() => {
    if (!args.enabled || forceExpandedRef.current) return;
    clearIdle();
    setExploring(true);
    scheduleIdleExpand();
  }, [args.enabled, clearIdle, scheduleIdleExpand, setExploring]);

  const readCamera = useCallback((): CameraSnapshot | null => {
    if (!map) return null;
    const center = map.getCenter();
    if (!center) return null;
    return {
      zoom: map.getZoom() ?? 0,
      tilt: map.getTilt() ?? 0,
      heading: map.getHeading() ?? 0,
      lat: center.lat(),
      lng: center.lng(),
    };
  }, [map]);

  const cameraMovedMeaningfully = useCallback((baseline: CameraSnapshot, next: CameraSnapshot): boolean => {
    if (Math.abs(next.zoom - baseline.zoom) >= MAP_EXPLORE_MIN_ZOOM_DELTA) return true;
    if (Math.abs(next.tilt - baseline.tilt) >= MAP_EXPLORE_MIN_TILT_DELTA) return true;
    const headingDelta = Math.abs(((next.heading - baseline.heading + 540) % 360) - 180);
    if (headingDelta >= MAP_EXPLORE_MIN_HEADING_DELTA) return true;
    const dLat = Math.abs(next.lat - baseline.lat);
    const dLng = Math.abs(next.lng - baseline.lng);
    return dLat > 0.00005 || dLng > 0.00005;
  }, []);

  useEffect(() => {
    if (!args.enabled) {
      expandChrome();
      clearMapExploring();
      return;
    }
    if (args.forceExpanded) {
      expandChrome();
    }
  }, [args.enabled, args.forceExpanded, expandChrome]);

  useEffect(() => {
    if (!args.enabled || !map) return undefined;
    mountedRef.current = true;

    const onGestureStart = () => {
      if (forceExpandedRef.current) return;
      gestureActiveRef.current = true;
      clearIdle();
      cameraBaselineRef.current = readCamera();
      clearEngage();
      engageTimerRef.current = window.setTimeout(() => {
        if (gestureActiveRef.current && !forceExpandedRef.current) {
          setExploring(true);
        }
      }, MAP_EXPLORE_ENGAGE_MS);
    };

    const onGestureChange = () => {
      if (forceExpandedRef.current || !gestureActiveRef.current) return;
      const baseline = cameraBaselineRef.current;
      const next = readCamera();
      if (baseline && next && cameraMovedMeaningfully(baseline, next)) {
        clearEngage();
        setExploring(true);
      }
    };

    const onGestureEnd = () => {
      gestureActiveRef.current = false;
      clearEngage();
      const baseline = cameraBaselineRef.current;
      const next = readCamera();
      const meaningful = Boolean(baseline && next && cameraMovedMeaningfully(baseline, next));
      cameraBaselineRef.current = null;
      if (meaningful && !forceExpandedRef.current) {
        setExploring(true);
        scheduleIdleExpand();
      } else if (exploringRef.current) {
        scheduleIdleExpand();
      } else {
        clearIdle();
      }
    };

    const onCameraKnob = () => {
      if (forceExpandedRef.current) return;
      // Ignore programmatic camera flights (first-open, quick actions).
      if (!gestureActiveRef.current && !pointerStartRef.current && !hasUserMovedCamera()) {
        return;
      }
      if (zoomSettleRef.current != null) window.clearTimeout(zoomSettleRef.current);
      zoomSettleRef.current = window.setTimeout(() => {
        noteMapInteraction();
      }, 80);
    };

    const listeners = [
      map.addListener("dragstart", onGestureStart),
      map.addListener("drag", onGestureChange),
      map.addListener("dragend", onGestureEnd),
      map.addListener("zoom_changed", onCameraKnob),
      map.addListener("tilt_changed", onCameraKnob),
      map.addListener("heading_changed", onCameraKnob),
    ];

    return () => {
      for (const listener of listeners) {
        listener.remove();
      }
      if (zoomSettleRef.current != null) window.clearTimeout(zoomSettleRef.current);
      clearEngage();
      clearIdle();
    };
  }, [
    args.enabled,
    map,
    cameraMovedMeaningfully,
    clearEngage,
    clearIdle,
    noteMapInteraction,
    readCamera,
    scheduleIdleExpand,
    setExploring,
  ]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    const surface = args.surfaceRef.current;
    if (!surface) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (forceExpandedRef.current) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "[data-map-marker], .cq-realm-map-top-chrome, .cq-realm-map-controls, .cq-dock-nav, button, input",
        )
      ) {
        return;
      }
      pointerStartRef.current = { x: event.clientX, y: event.clientY, t: performance.now() };
      clearEngage();
      engageTimerRef.current = window.setTimeout(() => {
        if (pointerStartRef.current && !forceExpandedRef.current) {
          setExploring(true);
        }
      }, MAP_EXPLORE_ENGAGE_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      const start = pointerStartRef.current;
      if (!start || forceExpandedRef.current) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) >= MAP_EXPLORE_MIN_DRAG_PX) {
        clearEngage();
        setExploring(true);
      }
    };

    const onPointerUp = () => {
      pointerStartRef.current = null;
      clearEngage();
      if (exploringRef.current) scheduleIdleExpand();
    };

    surface.addEventListener("pointerdown", onPointerDown, { passive: true });
    surface.addEventListener("pointermove", onPointerMove, { passive: true });
    surface.addEventListener("pointerup", onPointerUp, { passive: true });
    surface.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      clearEngage();
    };
  }, [args.enabled, args.surfaceRef, clearEngage, scheduleIdleExpand, setExploring]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".cq-dock-nav")) {
        expandChrome();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [args.enabled, expandChrome]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearEngage();
      clearIdle();
      clearMapExploring();
    };
  }, [clearEngage, clearIdle]);

  return useMemo(
    () => ({ expandChrome, noteMapInteraction }),
    [expandChrome, noteMapInteraction],
  );
}
