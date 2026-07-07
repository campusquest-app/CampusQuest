"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { GeoPoint } from "@/lib/realm/realmMapMarkerUtils";
import { markRealmMapStep } from "@/lib/realm/realmMapLifecycle";

/**
 * Gold dashed path to a tracked quest destination — shown only while a quest is actively tracked.
 */
export function QuestPathOverlay({
  from,
  to,
  enabled,
}: {
  from: GeoPoint | null;
  to: GeoPoint | null;
  enabled: boolean;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !enabled || !from || !to) {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      return undefined;
    }

    const polyline = new google.maps.Polyline({
      path: [from, to],
      geodesic: true,
      strokeColor: "rgba(201, 168, 76, 0.55)",
      strokeOpacity: 0,
      strokeWeight: 2.5,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 0.7,
            strokeColor: "rgba(201, 168, 76, 0.8)",
            scale: 2.2,
          },
          offset: "0",
          repeat: "16px",
        },
      ],
      zIndex: 2,
    });
    polyline.setMap(map);
    polylineRef.current = polyline;
    markRealmMapStep("overlay-creation", { type: "quest-path" });

    return () => {
      polyline.setMap(null);
      if (polylineRef.current === polyline) polylineRef.current = null;
    };
  }, [map, enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  return null;
}
