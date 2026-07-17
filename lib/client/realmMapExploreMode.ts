/**
 * Document-level Realm map “explore / navigation” mode.
 * CSS reads `data-cq-map-exploring` so the floating dock (outside the map tree)
 * can compact without React prop drilling.
 */

export const MAP_EXPLORE_ATTR = "data-cq-map-exploring";

/** Hold / continuous gesture before compacting (ignore taps). */
export const MAP_EXPLORE_ENGAGE_MS = 300;

/** Idle time before expanding chrome again. */
export const MAP_EXPLORE_IDLE_MS = 1250;

/** Ignore micro-drags that look like accidental touches. */
export const MAP_EXPLORE_MIN_DRAG_PX = 10;

/** Meaningful camera deltas. */
export const MAP_EXPLORE_MIN_ZOOM_DELTA = 0.08;
export const MAP_EXPLORE_MIN_TILT_DELTA = 2;
export const MAP_EXPLORE_MIN_HEADING_DELTA = 4;

export function setMapExploring(active: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (active) {
    root.setAttribute(MAP_EXPLORE_ATTR, "true");
  } else {
    root.removeAttribute(MAP_EXPLORE_ATTR);
  }
}

export function clearMapExploring(): void {
  setMapExploring(false);
}

export function isMapExploring(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(MAP_EXPLORE_ATTR) === "true";
}
