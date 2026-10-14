/** Navy fill shared by the dock silhouette SVG. */
export const DOCK_CRADLE_FILL = "#071422";

/** Matches `.cq-dock-nav__map-btn` (3.65rem at a 16px root). */
export const DOCK_CRADLE_BUTTON_PX = 58.4;

/** Gap between the glowing Map button and the navy cradle lip. */
export const DOCK_CRADLE_GAP_PX = 7;

/** How far the cradle rises above the flat bar. */
export const DOCK_CRADLE_RISE_PX = 22;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function dockCradleRadius(args?: {
  buttonRadius?: number;
  gap?: number;
  rise?: number;
}): number {
  const buttonRadius = args?.buttonRadius ?? DOCK_CRADLE_BUTTON_PX / 2;
  const gap = args?.gap ?? DOCK_CRADLE_GAP_PX;
  const rise = args?.rise ?? DOCK_CRADLE_RISE_PX;
  const halfChord = buttonRadius + gap + 10;
  return (rise * rise + halfChord * halfChord) / (2 * rise);
}

/**
 * Single continuous dock silhouette: a full-width navy bar whose top edge
 * rises in a circular cradle around the Map button. Arc radii stay constant
 * so the cradle remains circular at 375 / 390 / 430px widths.
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
  const rise = Math.min(args.rise ?? DOCK_CRADLE_RISE_PX, height);
  const r = dockCradleRadius({
    buttonRadius: args.buttonRadius,
    gap: args.gap,
    rise,
  });
  const buttonRadius = args.buttonRadius ?? DOCK_CRADLE_BUTTON_PX / 2;
  const gap = args.gap ?? DOCK_CRADLE_GAP_PX;
  const halfChord = buttonRadius + gap + 10;
  const leftJoin = cx - halfChord;
  const rightJoin = cx + halfChord;

  return [
    `M0,${fmt(rise)}`,
    `H${fmt(leftJoin)}`,
    `A${fmt(r)},${fmt(r)} 0 0 0 ${fmt(rightJoin)},${fmt(rise)}`,
    `H${fmt(width)}`,
    `V${fmt(height)}`,
    `H0`,
    "Z",
  ].join(" ");
}
