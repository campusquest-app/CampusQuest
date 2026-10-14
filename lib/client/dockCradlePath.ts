/** Navy fill shared by the dock silhouette SVG. */
export const DOCK_CRADLE_FILL = "#071422";

/** Matches `.cq-dock-nav__map-btn` (3.65rem at a 16px root). */
export const DOCK_CRADLE_BUTTON_PX = 58.4;

/** Gap between the glowing Map button and the navy dome. */
export const DOCK_CRADLE_GAP_PX = 7;

/** How far the dome rises above the flat bar. Stays out of the bar's layout height. */
export const DOCK_CRADLE_RISE_PX = 30;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function dockCradleRadius(args?: { buttonRadius?: number; gap?: number }): number {
  const buttonRadius = args?.buttonRadius ?? DOCK_CRADLE_BUTTON_PX / 2;
  const gap = args?.gap ?? DOCK_CRADLE_GAP_PX;
  return buttonRadius + gap;
}

/** Circle for the upward dome. Center sits below the bar's top edge so the minor arc rises. */
export function dockCradleMetrics(args?: {
  buttonRadius?: number;
  gap?: number;
  rise?: number;
}): { radius: number; rise: number; halfChord: number; centerDrop: number } {
  const radius = dockCradleRadius(args);
  const rise = Math.min(args?.rise ?? DOCK_CRADLE_RISE_PX, radius - 0.5);
  const centerDrop = radius - rise;
  const halfChord = Math.sqrt(Math.max(0, radius * radius - centerDrop * centerDrop));
  return { radius, rise, halfChord, centerDrop };
}

/**
 * Single continuous dock silhouette. `height` is the SVG box, including the
 * dome rise above the flat top edge. The arc is the minor clockwise sweep,
 * so the navy rises above that edge instead of cutting a notch into the bar.
 */
export function dockCradlePath(args: {
  width: number;
  height: number;
  centerX?: number;
  buttonRadius?: number;
  gap?: number;
  rise?: number;
}): string {
  const width = Math.max(1, args.width);
  const height = Math.max(1, args.height);
  const cx = args.centerX ?? width / 2;
  const { radius, rise, halfChord } = dockCradleMetrics({
    buttonRadius: args.buttonRadius,
    gap: args.gap,
    rise: Math.min(args.rise ?? DOCK_CRADLE_RISE_PX, height),
  });
  const leftJoin = cx - halfChord;
  const rightJoin = cx + halfChord;

  return [
    `M0,${fmt(rise)}`,
    `H${fmt(leftJoin)}`,
    `A${fmt(radius)},${fmt(radius)} 0 0 1 ${fmt(rightJoin)},${fmt(rise)}`,
    `H${fmt(width)}`,
    `V${fmt(height)}`,
    `H0`,
    "Z",
  ].join(" ");
}
