"use client";

import { useEffect, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";

export function useMapZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(URI_MAP_DEFAULT_ZOOM);

  useEffect(() => {
    if (!map) return undefined;
    const sync = () => setZoom(map.getZoom() ?? URI_MAP_DEFAULT_ZOOM);
    sync();
    const listener = map.addListener("zoom_changed", sync);
    return () => listener.remove();
  }, [map]);

  return zoom;
}

/** Fade minor pins in as the user zooms closer. */
export function markerRevealOpacity(zoom: number, major: boolean): number {
  if (major) return 1;
  if (zoom < 14.5) return 0;
  if (zoom >= 16.5) return 1;
  return (zoom - 14.5) / 2;
}
