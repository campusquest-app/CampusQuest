"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";

/**
 * Ensures Google Maps accepts native tilt/rotate gestures.
 * Never writes heading/tilt through setOptions (that resets VECTOR camera).
 */
export function RealmMapCameraGestures({
  enabled,
  touchMobile = false,
}: {
  enabled: boolean;
  touchMobile?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled) return;

    if (typeof map.setTiltInteractionEnabled === "function") {
      map.setTiltInteractionEnabled(true);
    }
    if (typeof map.setHeadingInteractionEnabled === "function") {
      map.setHeadingInteractionEnabled(true);
    }
    map.setOptions({
      gestureHandling: "greedy",
      rotateControl: true,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      zoomControl: !touchMobile,
      keyboardShortcuts: !touchMobile,
      isFractionalZoomEnabled: true,
    });
  }, [map, enabled, touchMobile]);

  useEffect(() => {
    if (!map || !enabled) return undefined;

    const div = map.getDiv();
    if (!div) return undefined;

    // Prefer browser default touch handling for Google’s gesture engine.
    div.style.touchAction = "manipulation";
    div.style.pointerEvents = "auto";
    div.setAttribute("data-no-drawer-swipe", "true");
    div.setAttribute("data-cq-gesture-block", "all");

    const setPanningAttr = (active: boolean) => {
      document.documentElement.toggleAttribute("data-realm-map-panning", active);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 1) setPanningAttr(true);
    };
    const onTouchEnd = () => setPanningAttr(false);
    const onTouchCancel = () => setPanningAttr(false);

    div.addEventListener("touchstart", onTouchStart, { passive: true });
    div.addEventListener("touchend", onTouchEnd, { passive: true });
    div.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      div.removeEventListener("touchstart", onTouchStart);
      div.removeEventListener("touchend", onTouchEnd);
      div.removeEventListener("touchcancel", onTouchCancel);
      setPanningAttr(false);
    };
  }, [map, enabled]);

  useEffect(() => {
    if (!enabled) {
      document.documentElement.removeAttribute("data-realm-map-tilted");
      return;
    }
    if (!map) return undefined;

    const syncTiltAttr = () => {
      const tilted = (map.getTilt() ?? 0) >= 2;
      document.documentElement.toggleAttribute("data-realm-map-tilted", tilted);
    };

    syncTiltAttr();
    const tiltListener = map.addListener("tilt_changed", syncTiltAttr);
    const idleListener = map.addListener("idle", syncTiltAttr);

    return () => {
      google.maps.event.removeListener(tiltListener);
      google.maps.event.removeListener(idleListener);
      document.documentElement.removeAttribute("data-realm-map-tilted");
    };
  }, [map, enabled]);

  return null;
}
