"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";

/**
 * Ensures vector rendering when a Map ID is configured and logs a clear
 * development warning when the Map ID is missing (does not log the ID/key).
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
        "[cq:realm-map] NEXT_PUBLIC_GOOGLE_MAP_ID is missing. " +
          "The map will use the raster renderer — native tilt, rotation, and 3D buildings will not work. " +
          "Create a vector Map ID in Google Cloud Console → Map Management and set the env var.",
      );
    }
  }, []);

  useEffect(() => {
    if (!map || !tilesLoaded) return;

    // Re-assert gesture options after tiles (reuseMaps / layer switches can drop them).
    map.setOptions({
      gestureHandling: "greedy",
      rotateControl: true,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
    });

    if (!vector3dEnabled) {
      onVectorRendering?.(false);
      return;
    }

    const renderingType = google.maps.RenderingType?.VECTOR;
    if (renderingType != null) {
      map.setOptions({ renderingType });
    }

    let warnedNonVector = false;
    const report = () => {
      const vector = map.getRenderingType?.() === google.maps.RenderingType?.VECTOR;
      onVectorRendering?.(Boolean(vector));
      if (process.env.NODE_ENV === "development" && !vector && !warnedNonVector) {
        warnedNonVector = true;
        console.warn(
          "[cq:realm-map] Map ID is set but vector rendering was not detected. " +
            "Confirm the Map ID is a vector map style in Google Cloud Console.",
        );
      }
    };

    report();
    const idleListener = map.addListener("idle", report);
    return () => {
      google.maps.event.removeListener(idleListener);
    };
  }, [map, onVectorRendering, tilesLoaded, vector3dEnabled]);

  return null;
}
