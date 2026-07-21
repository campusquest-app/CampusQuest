"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";

/**
 * Ensures Google Maps accepts native tilt/rotate gestures and prevents the
 * page/drawer from stealing multi-touch while the user manipulates the camera.
 */
export function RealmMapCameraGestures({ enabled }: { enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled) return;

    map.setOptions({
      gestureHandling: "greedy",
      rotateControl: true,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      keyboardShortcuts: true,
      isFractionalZoomEnabled: true,
      clickableIcons: false,
    });

    if (typeof map.setTiltInteractionEnabled === "function") {
      map.setTiltInteractionEnabled(true);
    }
    if (typeof map.setHeadingInteractionEnabled === "function") {
      map.setHeadingInteractionEnabled(true);
    }
  }, [map, enabled]);

  useEffect(() => {
    if (!map || !enabled) return undefined;

    const div = map.getDiv();
    if (!div) return undefined;

    div.style.touchAction = "none";
    // Ensure empty overlay siblings never steal multi-touch from the canvas.
    div.style.pointerEvents = "auto";

    const setPanningAttr = (active: boolean) => {
      document.documentElement.toggleAttribute("data-realm-map-panning", active);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) setPanningAttr(true);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) setPanningAttr(false);
    };
    const onTouchCancel = () => setPanningAttr(false);

    // Passive only — never preventDefault; Google Maps owns multi-touch.
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
