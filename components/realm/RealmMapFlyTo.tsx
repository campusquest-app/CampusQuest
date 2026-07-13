"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import { shouldSkipAutomaticFlyTo } from "@/lib/realm/mapCameraGuard";

/** Smoothly pans/zooms the map toward a selected marker when the location sheet opens. */
export function RealmMapFlyTo({
  target,
  enabled,
  force = false,
}: {
  target: { lat: number; lng: number } | null;
  enabled: boolean;
  /** Bypass camera guard for explicit user actions (search, locate). */
  force?: boolean;
}) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !enabled || !target) return;
    if (!force && shouldSkipAutomaticFlyTo()) return;

    const key = `${target.lat.toFixed(5)}:${target.lng.toFixed(5)}:${force ? "f" : "a"}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    const currentZoom = map.getZoom() ?? URI_MAP_DEFAULT_ZOOM;
    const nextZoom = Math.min(19, Math.max(currentZoom, 17));

    map.panTo(target);
    if (currentZoom < nextZoom) {
      map.setZoom(nextZoom);
    }
  }, [enabled, force, map, target]);

  useEffect(() => {
    if (!enabled) lastKeyRef.current = null;
  }, [enabled]);

  return null;
}
