"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { applyCinematicCampusCamera, trySetMapTilt, URI_MAP_CINEMATIC_TILT } from "@/lib/realm/googleMapPose";

/**
 * Applies the default cinematic camera once the vector map is ready.
 * 3D building extrusion requires vector rendering + Map ID — see googleMapConfig.ts.
 */
export function RealmMapCameraBootstrap({
  mapLayer,
  vector3dEnabled,
  tilesLoaded,
  onTiltUnsupported,
}: {
  mapLayer: "campus" | "satellite";
  vector3dEnabled: boolean;
  tilesLoaded: boolean;
  onTiltUnsupported?: () => void;
}) {
  const map = useMap();
  const bootstrappedRef = useRef(false);
  const prevLayerRef = useRef(mapLayer);

  useEffect(() => {
    if (!map || !tilesLoaded || !vector3dEnabled || mapLayer !== "campus") return undefined;
    if (bootstrappedRef.current) return undefined;

    let cancelled = false;
    const bootstrap = () => {
      if (cancelled || bootstrappedRef.current) return;
      bootstrappedRef.current = true;
      applyCinematicCampusCamera(map);
      window.setTimeout(() => {
        if (cancelled) return;
        const actual = map.getTilt() ?? 0;
        if (actual < URI_MAP_CINEMATIC_TILT - 2) {
          trySetMapTilt(map, 0);
          onTiltUnsupported?.();
        }
      }, 400);
    };

    const idleListener = map.addListener("idle", bootstrap);
    bootstrap();

    return () => {
      cancelled = true;
      google.maps.event.removeListener(idleListener);
    };
  }, [map, mapLayer, onTiltUnsupported, tilesLoaded, vector3dEnabled]);

  useEffect(() => {
    if (!map || !tilesLoaded) return;

    const prevLayer = prevLayerRef.current;
    prevLayerRef.current = mapLayer;

    if (mapLayer === "satellite") {
      map.setTilt(0);
      return;
    }

    if (
      mapLayer === "campus" &&
      vector3dEnabled &&
      bootstrappedRef.current &&
      prevLayer === "satellite"
    ) {
      applyCinematicCampusCamera(map);
    }
  }, [map, mapLayer, tilesLoaded, vector3dEnabled]);

  return null;
}
