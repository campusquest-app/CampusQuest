"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";

function RaisedBuildingPin({
  position,
  major,
  selected,
  raised,
  zIndex,
}: {
  position: { lat: number; lng: number };
  major: boolean;
  selected: boolean;
  raised: boolean;
  zIndex: number;
}) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (!map) return undefined;

    const div = document.createElement("div");
    div.className = "cq-raised-building-pin";
    div.style.pointerEvents = "none";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML =
      '<span class="cq-raised-building-pin-shadow"></span><span class="cq-raised-building-pin-body"></span>';

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {
      const pane = overlay.getPanes()?.overlayLayer;
      pane?.appendChild(div);
      setContainer(div);
    };
    overlay.draw = () => {
      const projection = overlay.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(positionRef.current.lat, positionRef.current.lng),
      );
      if (!point) return;
      div.style.left = `${point.x}px`;
      div.style.top = `${point.y}px`;
      div.style.zIndex = String(zIndex);
    };
    overlay.onRemove = () => {
      div.remove();
      setContainer(null);
    };

    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map, zIndex]);

  useEffect(() => {
    overlayRef.current?.draw();
  }, [position.lat, position.lng]);

  useEffect(() => {
    if (!container) return;
    container.classList.toggle("cq-raised-building-pin--raised", raised);
    container.classList.toggle("cq-raised-building-pin--selected", selected);
    container.classList.toggle("cq-raised-building-pin--major", major);
  }, [container, major, raised, selected]);

  return null;
}

export type RaisedBuildingLandmark = {
  id: string;
  major: boolean;
};

/** Lightweight raised-building fallback when native Google 3D extrusion is unavailable. */
export function RealmRaisedBuildingsOverlay({
  enabled,
  landmarks,
  geoPositions,
  activeMarkerId,
}: {
  enabled: boolean;
  landmarks: RaisedBuildingLandmark[];
  geoPositions: Record<string, { lat: number; lng: number }>;
  activeMarkerId: string | null;
}) {
  if (!enabled) return null;

  return (
    <>
      {landmarks.map((landmark) => {
        if (landmark.id === "the-quad") return null;
        const position = geoPositions[landmark.id];
        if (!position) return null;
        const selected = activeMarkerId === landmark.id;
        return (
          <RaisedBuildingPin
            key={landmark.id}
            position={position}
            major={landmark.major}
            selected={selected}
            raised={enabled}
            zIndex={selected ? 4 : landmark.major ? 3 : 2}
          />
        );
      })}
    </>
  );
}
