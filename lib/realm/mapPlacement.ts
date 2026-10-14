import { geoToRealmMapPercent, isValidCampusCoordinate } from "@/lib/realm/geoToMapPercent";

export type MarkerPlacementPoint = {
  lat: number;
  lng: number;
  x: number;
  y: number;
};

export type MarkerPlacement = {
  placing: boolean;
  preview: MarkerPlacementPoint | null;
};

export const IDLE_MARKER_PLACEMENT: MarkerPlacement = { placing: false, preview: null };

export function beginMarkerPlacement(): MarkerPlacement {
  return { placing: true, preview: null };
}

export function resetMarkerPlacement(): MarkerPlacement {
  return IDLE_MARKER_PLACEMENT;
}

/** Return to tap mode without discarding a preview the user may still confirm. */
export function repositionMarkerPlacement(state: MarkerPlacement): MarkerPlacement {
  return { placing: true, preview: state.preview };
}

export function latLngFromMapClick(event: {
  detail?: { latLng?: { lat: number; lng: number } | null } | null;
}): { lat: number; lng: number } | null {
  const latLng = event.detail?.latLng;
  if (!latLng || !isValidCampusCoordinate(latLng.lat, latLng.lng)) return null;
  return { lat: latLng.lat, lng: latLng.lng };
}

export function placementPointFromGeo(lat: number, lng: number): MarkerPlacementPoint | null {
  if (!isValidCampusCoordinate(lat, lng)) return null;
  const percent = geoToRealmMapPercent(lat, lng);
  return {
    lat: Math.round(lat * 1_000_000) / 1_000_000,
    lng: Math.round(lng * 1_000_000) / 1_000_000,
    x: Math.round(percent.x * 100) / 100,
    y: Math.round(percent.y * 100) / 100,
  };
}

/**
 * A map tap commits a preview only while placement mode is on and the gesture
 * was not a pan or drag. Invalid coordinates leave the editor unchanged.
 */
export function previewMarkerPlacement(
  state: MarkerPlacement,
  lat: number,
  lng: number,
  options?: { dragged?: boolean },
): MarkerPlacement {
  if (!state.placing || options?.dragged) return state;
  const point = placementPointFromGeo(lat, lng);
  if (!point) return state;
  return { placing: false, preview: point };
}
