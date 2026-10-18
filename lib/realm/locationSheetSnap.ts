export type LocationSheetSnap = "peek" | "expanded";

/** Initial sheet height as a fraction of the space above the bottom nav. */
export const LOCATION_SHEET_PEEK_RATIO = 0.52;
/** Expanded sheet height as a fraction of that same space. */
export const LOCATION_SHEET_EXPANDED_RATIO = 0.88;

export function locationSheetAvailableHeight(
  viewportHeight: number,
  navClearance: number,
  safeTop = 0,
): number {
  if (!Number.isFinite(viewportHeight)) return 0;
  return Math.max(0, viewportHeight - Math.max(0, navClearance) - Math.max(0, safeTop));
}

export function locationSheetHeightPx(available: number, snap: LocationSheetSnap): number {
  const ratio = snap === "expanded" ? LOCATION_SHEET_EXPANDED_RATIO : LOCATION_SHEET_PEEK_RATIO;
  return Math.round(Math.max(0, available) * ratio);
}

/**
 * Positive dy is a downward drag.
 * Expanded + down collapses to peek. Peek + down dismisses. Up expands.
 * A long downward flick from expanded can dismiss in one gesture.
 */
export function nextLocationSheetSnap(
  current: LocationSheetSnap,
  dy: number,
): LocationSheetSnap | "closed" {
  if (!Number.isFinite(dy)) return current;
  if (dy <= -48) return "expanded";
  if (current === "expanded" && dy >= 160) return "closed";
  if (current === "expanded" && dy >= 56) return "peek";
  if (current === "peek" && dy >= 72) return "closed";
  return current;
}

/** How far a full-height sheet is shifted down so only the peek is visible. */
export function locationSheetRestingOffset(sheetHeight: number, snap: LocationSheetSnap): number {
  if (!Number.isFinite(sheetHeight) || sheetHeight <= 0) return 0;
  if (snap === "expanded") return 0;
  const hidden = 1 - LOCATION_SHEET_PEEK_RATIO / LOCATION_SHEET_EXPANDED_RATIO;
  return Math.round(sheetHeight * hidden);
}

/** Live drag offset. Positive dy moves the sheet down. Never past fully open or fully offscreen. */
export function locationSheetDragOffset(resting: number, dy: number, sheetHeight: number): number {
  if (!Number.isFinite(resting) || !Number.isFinite(sheetHeight)) return 0;
  if (!Number.isFinite(dy)) return Math.max(0, resting);
  const limit = Math.max(0, sheetHeight);
  return Math.round(Math.min(limit, Math.max(0, resting + dy)));
}

/**
 * Decide whether a pointer movement should move the sheet.
 * Buttons, horizontal rails, and an already-scrolled sheet keep their own gestures.
 */
export function locationSheetDragIntent(args: {
  interactive: boolean;
  onHandle: boolean;
  scrollTop: number;
  dx: number;
  dy: number;
  canScroll: boolean;
}): "ignore" | "wait" | "drag" | "cancel" {
  if (args.interactive) return "ignore";
  if (!args.onHandle && args.scrollTop > 1) return "ignore";
  if (!Number.isFinite(args.dx) || !Number.isFinite(args.dy)) return "wait";
  if (Math.abs(args.dx) < 8 && Math.abs(args.dy) < 8) return "wait";
  if (Math.abs(args.dx) > Math.abs(args.dy)) return "cancel";
  if (!args.onHandle && args.dy < 0 && args.canScroll) return "cancel";
  return "drag";
}

function worldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(sin, -0.9999), 0.9999);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * scale,
  };
}

/** Marker Y inside the map container. Does not change zoom, tilt, or bearing. */
export function markerContainerY(args: {
  lat: number;
  lng: number;
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
}): number | null {
  const values = [args.lat, args.lng, args.centerLat, args.centerLng, args.zoom, args.width, args.height];
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (args.zoom <= 0 || args.width <= 0 || args.height <= 0) return null;
  const marker = worldPixel(args.lat, args.lng, args.zoom);
  const center = worldPixel(args.centerLat, args.centerLng, args.zoom);
  return marker.y - center.y + args.height / 2;
}

/**
 * How far to pan the map downward so a marker covered by the sheet moves up
 * into the visible map. Zero when the marker is already clear of the sheet.
 */
export function revealMarkerPanY(markerY: number, visibleBottom: number, margin = 28): number {
  if (!Number.isFinite(markerY) || !Number.isFinite(visibleBottom)) return 0;
  if (markerY <= visibleBottom - margin) return 0;
  return Math.round(markerY - (visibleBottom - margin));
}
