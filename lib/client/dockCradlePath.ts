/** Navy fill shared by the dock silhouette SVG (flat sections). */
export const DOCK_CRADLE_FILL = "#071422";

/** Top-of-dock fill (subtle vertical gradient start). */
export const DOCK_CRADLE_FILL_TOP = "#0a1c30";

/** Thin cyan stroke along the curved top edge. */
export const DOCK_CRADLE_STROKE = "rgba(110, 200, 255, 0.72)";

/** Matches `.cq-dock-nav__map-btn` (~3.75rem at a 16px root). */
export const DOCK_CRADLE_BUTTON_PX = 60;

/** Gap between the Map button edge and the cradle arc. */
export const DOCK_CRADLE_GAP_PX = 6;

/**
 * How far the cradle dips below the flat top edge (shallow well, not a deep U).
 * Kept smaller than the button radius so the Map orb stays mostly inside the bar.
 */
export const DOCK_CRADLE_DIP_PX = 18;

/**
 * @deprecated Upward dome was removed; cradle now dips downward into the bar.
 * Kept as 0 so any leftover layout math does not lift the silhouette.
 */
export const DOCK_CRADLE_RISE_PX = 0;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Half-width of the cradle chord along the flat top edge. */
export function dockCradleHalfChord(args?: { buttonRadius?: number; gap?: number }): number {
  const buttonRadius = args?.buttonRadius ?? DOCK_CRADLE_BUTTON_PX / 2;
  const gap = args?.gap ?? DOCK_CRADLE_GAP_PX;
  // Slightly wider than the button so the well frames the orb with a visible shoulder.
  return buttonRadius + gap + 4;
}

/**
 * Circular cradle that dips downward from the flat top.
 * Radius is derived from dip + half-chord so the arc stays a shallow minor sweep.
 */
export function dockCradleMetrics(args?: {
  buttonRadius?: number;
  gap?: number;
  dip?: number;
}): { radius: number; dip: number; halfChord: number; centerDrop: number } {
  const halfChord = dockCradleHalfChord(args);
  const dip = Math.max(1, args?.dip ?? DOCK_CRADLE_DIP_PX);
  // R = (w² + d²) / (2d) — circle through the join points and the dip nadir.
  const radius = (halfChord * halfChord + dip * dip) / (2 * dip);
  // Center sits above the flat edge so the minor arc bows downward into the bar.
  const centerDrop = dip - radius;
  return { radius, dip, halfChord, centerDrop };
}

/** @deprecated Use dockCradleMetrics().radius — radius is no longer button+gap alone. */
export function dockCradleRadius(args?: { buttonRadius?: number; gap?: number; dip?: number }): number {
  return dockCradleMetrics(args).radius;
}

/**
 * Open top-edge contour (flat → cradle → flat) for the cyan stroke.
 * y = 0 is the flat top of the dock; the cradle dips to positive y.
 */
export function dockCradleTopPath(args: {
  width: number;
  centerX?: number;
  buttonRadius?: number;
  gap?: number;
  dip?: number;
}): string {
  const width = Math.max(1, args.width);
  const cx = args.centerX ?? width / 2;
  const { radius, dip, halfChord } = dockCradleMetrics({
    buttonRadius: args.buttonRadius,
    gap: args.gap,
    dip: args.dip,
  });
  const leftJoin = Math.max(0, cx - halfChord);
  const rightJoin = Math.min(width, cx + halfChord);

  return [
    `M0,0`,
    `H${fmt(leftJoin)}`,
    // sweep-flag 0 (counterclockwise): with the circle center above the flat edge,
    // the minor arc bows downward into the bar (shallow cradle, not an upward hump).
    `A${fmt(radius)},${fmt(radius)} 0 0 0 ${fmt(rightJoin)},0`,
    `H${fmt(width)}`,
  ].join(" ");
}

/**
 * Single continuous dock silhouette. Height is the bar's layout box (no upward dome).
 * The top edge dips into a shallow cradle around the Map button, then returns to flat.
 */
export function dockCradlePath(args: {
  width: number;
  height: number;
  centerX?: number;
  buttonRadius?: number;
  gap?: number;
  dip?: number;
}): string {
  const width = Math.max(1, args.width);
  const height = Math.max(1, args.height);
  const top = dockCradleTopPath(args);

  return [top, `V${fmt(height)}`, `H0`, "Z"].join(" ");
}
