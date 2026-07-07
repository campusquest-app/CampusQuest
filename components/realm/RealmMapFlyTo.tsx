"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";

/** Smoothly pans/zooms the map toward a selected marker when the location sheet opens. */
export function RealmMapFlyTo({
  target,
  enabled,
}: {
  target: { lat: number; lng: number } | null;
  enabled: boolean;
}) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !enabled || !target) return;

    const key = `${target.lat.toFixed(5)}:${target.lng.toFixed(5)}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    const currentZoom = map.getZoom() ?? URI_MAP_DEFAULT_ZOOM;
    const nextZoom = Math.min(19, Math.max(currentZoom, 17));

    map.panTo(target);
    if (currentZoom < nextZoom) {
      map.setZoom(nextZoom);
    }
  }, [enabled, map, target]);

  useEffect(() => {
    if (!enabled) lastKeyRef.current = null;
  }, [enabled]);

  return null;
}
