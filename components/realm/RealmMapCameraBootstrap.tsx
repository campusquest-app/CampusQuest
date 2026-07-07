"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { resetFlatMapOrientation } from "@/lib/realm/googleMapPose";

/**
 * Keeps satellite flat; campus tilt/buildings are user-controlled via map controls.
 */
export function RealmMapCameraBootstrap({
  mapLayer,
  tilesLoaded,
}: {
  mapLayer: "campus" | "satellite";
  vector3dEnabled?: boolean;
  tilesLoaded: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !tilesLoaded || mapLayer !== "satellite") return;
    resetFlatMapOrientation(map);
  }, [map, mapLayer, tilesLoaded]);

  return null;
}
