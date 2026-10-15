"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { readMapCameraPose, saveSessionMapCamera } from "@/lib/realm/sessionMapCamera";

/**
 * Persists the live camera pose into sessionStorage after the user settles,
 * so remounts / reloads in the same session can restore their view.
 */
export function RealmMapSessionCamera({ enabled }: { enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled) return undefined;

    let timer = 0;
    const persist = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const pose = readMapCameraPose(map);
        if (pose) saveSessionMapCamera(pose);
      }, 350);
    };

    const listeners = [
      map.addListener("idle", persist),
      map.addListener("dragend", persist),
      map.addListener("zoom_changed", persist),
      map.addListener("tilt_changed", persist),
      map.addListener("heading_changed", persist),
    ];

    return () => {
      window.clearTimeout(timer);
      listeners.forEach((listener) => google.maps.event.removeListener(listener));
    };
  }, [map, enabled]);

  return null;
}
