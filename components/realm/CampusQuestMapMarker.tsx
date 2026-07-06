"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";

/**
 * HTML marker rendered through a google.maps.OverlayView.
 *
 * Works with vector Map IDs (satellite + tilt) where AdvancedMarkerElement
 * would require cloud styling. Supports tap, z-index, and admin drag.
 */
export function CampusQuestMapMarker({
  position,
  zIndex = 0,
  draggable = false,
  onClick,
  onDragEnd,
  children,
}: {
  position: { lat: number; lng: number };
  zIndex?: number;
  draggable?: boolean;
  onClick?: () => void;
  onDragEnd?: (lat: number, lng: number) => void;
  children: ReactNode;
}) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  const positionRef = useRef(position);
  positionRef.current = position;
  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    if (!map) return undefined;

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.transform = "translate(-50%, -100%)";
    div.style.cursor = "pointer";
    div.style.touchAction = "none";
    div.style.overflow = "visible";
    div.setAttribute("data-map-marker", "true");
    div.setAttribute("data-no-drawer-swipe", "true");

    class MarkerOverlay extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(positionRef.current.lat, positionRef.current.lng),
        );
        if (!point) return;
        div.style.left = `${point.x}px`;
        div.style.top = `${point.y}px`;
      }
      onRemove() {
        div.remove();
      }
    }

    const overlay = new MarkerOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    setContainer(div);

    const drag = { active: false, pointerId: -1, moved: false, latLng: null as google.maps.LatLng | null };

    const containerLatLng = (clientX: number, clientY: number): google.maps.LatLng | null => {
      const projection = overlay.getProjection();
      if (!projection) return null;
      const rect = map.getDiv().getBoundingClientRect();
      return projection.fromContainerPixelToLatLng(
        new google.maps.Point(clientX - rect.left, clientY - rect.top),
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      // Never let a press on a marker start a map pan.
      e.stopPropagation();
      if (!draggableRef.current) return;
      e.preventDefault();
      drag.active = true;
      drag.pointerId = e.pointerId;
      drag.moved = false;
      drag.latLng = null;
      div.setPointerCapture(e.pointerId);
      map.setOptions({ draggable: false });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const latLng = containerLatLng(e.clientX, e.clientY);
      if (!latLng) return;
      drag.moved = true;
      drag.latLng = latLng;
      const projection = overlay.getProjection();
      const point = projection?.fromLatLngToDivPixel(latLng);
      if (point) {
        div.style.left = `${point.x}px`;
        div.style.top = `${point.y}px`;
      }
    };

    const endDrag = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.pointerId) return;
      e.stopPropagation();
      if (div.hasPointerCapture(e.pointerId)) div.releasePointerCapture(e.pointerId);
      const { moved, latLng } = drag;
      drag.active = false;
      drag.pointerId = -1;
      map.setOptions({ draggable: true });
      if (moved && latLng) {
        onDragEndRef.current?.(latLng.lat(), latLng.lng());
      } else {
        // A press without movement counts as a tap (select in edit mode).
        onClickRef.current?.();
      }
    };

    const onClickDom = (e: MouseEvent) => {
      // Keep marker taps from also triggering the map's click handler
      // (admin tap-to-place must not fire when tapping a pin).
      e.stopPropagation();
      if (draggableRef.current) return; // handled by endDrag tap path
      onClickRef.current?.();
    };

    div.addEventListener("pointerdown", onPointerDown);
    div.addEventListener("pointermove", onPointerMove);
    div.addEventListener("pointerup", endDrag);
    div.addEventListener("pointercancel", endDrag);
    div.addEventListener("click", onClickDom);

    return () => {
      div.removeEventListener("pointerdown", onPointerDown);
      div.removeEventListener("pointermove", onPointerMove);
      div.removeEventListener("pointerup", endDrag);
      div.removeEventListener("pointercancel", endDrag);
      div.removeEventListener("click", onClickDom);
      overlay.setMap(null);
      overlayRef.current = null;
      setContainer(null);
      map.setOptions({ draggable: true });
    };
  }, [map]);

  useEffect(() => {
    if (container) container.style.zIndex = String(zIndex);
  }, [container, zIndex]);

  useEffect(() => {
    overlayRef.current?.draw();
  }, [position.lat, position.lng]);

  if (!container) return null;
  return createPortal(children, container);
}
