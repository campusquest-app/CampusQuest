"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";

/**
 * Ensures vector rendering when a Map ID is configured and logs a dev warning when missing.
 */
export function RealmMapVectorInit({
  vector3dEnabled,
  tilesLoaded,
  onVectorRendering,
}: {
  vector3dEnabled: boolean;
  tilesLoaded: boolean;
  onVectorRendering?: (vector: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!REALM_GOOGLE_MAP_ID) {
      console.warn(
        "[cq:realm-map] Google Vector Map ID missing. Native 3D buildings unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    if (!map || !tilesLoaded || !vector3dEnabled) return;

    const renderingType = google.maps.RenderingType?.VECTOR;
    if (renderingType != null) {
      map.setOptions({ renderingType });
    }

    const report = () => {
      const vector = map.getRenderingType?.() === google.maps.RenderingType?.VECTOR;
      onVectorRendering?.(Boolean(vector));
    };

    report();
    const idleListener = map.addListener("idle", report);
    return () => {
      google.maps.event.removeListener(idleListener);
    };
  }, [map, onVectorRendering, tilesLoaded, vector3dEnabled]);

  return null;
}
