"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import { shouldSkipAutomaticFlyTo } from "@/lib/realm/mapCameraGuard";
import {
  locationSheetAvailableHeight,
  locationSheetHeightPx,
  markerContainerY,
  revealMarkerPanY,
} from "@/lib/realm/locationSheetSnap";

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

    if (force) {
      const currentZoom = map.getZoom() ?? URI_MAP_DEFAULT_ZOOM;
      const nextZoom = Math.min(19, Math.max(currentZoom, 17));
      map.panTo(target);
      if (currentZoom < nextZoom) {
        map.setZoom(nextZoom);
      }
      return;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const div = map.getDiv();
    if (!center || zoom == null || !div) return;
    const markerY = markerContainerY({
      lat: target.lat,
      lng: target.lng,
      centerLat: center.lat(),
      centerLng: center.lng(),
      zoom,
      width: div.clientWidth,
      height: div.clientHeight,
    });
    if (markerY == null) return;
    const nav = Math.min(140, Math.max(64, div.clientHeight * 0.12));
    const available = locationSheetAvailableHeight(div.clientHeight, nav, 0);
    const sheetTop = div.clientHeight - nav - locationSheetHeightPx(available, "peek");
    const panY = revealMarkerPanY(markerY, sheetTop);
    if (panY > 8) map.panBy(0, panY);
  }, [enabled, force, map, target]);

  useEffect(() => {
    if (!enabled) lastKeyRef.current = null;
  }, [enabled]);

  return null;
}
