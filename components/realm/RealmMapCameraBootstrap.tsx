"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { applyCinematicCampusCamera } from "@/lib/realm/googleMapPose";

/**
 * Restores cinematic camera when switching from satellite back to campus.
 * Map starts flat — tilt/buildings are user-controlled via map controls.
 */
export function RealmMapCameraBootstrap({
  mapLayer,
  vector3dEnabled,
  tilesLoaded,
}: {
  mapLayer: "campus" | "satellite";
  vector3dEnabled: boolean;
  tilesLoaded: boolean;
}) {
  const map = useMap();
  const prevLayerRef = useRef(mapLayer);

  useEffect(() => {
    if (!map || !tilesLoaded) return;

    const prevLayer = prevLayerRef.current;
    prevLayerRef.current = mapLayer;

    if (mapLayer === "satellite") {
      map.setTilt(0);
      return;
    }

    if (mapLayer === "campus" && vector3dEnabled && prevLayer === "satellite") {
      applyCinematicCampusCamera(map, { preserveCenter: true, preserveHeading: true });
    }
  }, [map, mapLayer, tilesLoaded, vector3dEnabled]);

  return null;
}
