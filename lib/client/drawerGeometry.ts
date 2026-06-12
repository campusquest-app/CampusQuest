export const DRAWER_SNAP_MS = 260;
export const DRAWER_VELOCITY_OPEN_PX_MS = 0.45;
export const DRAWER_VELOCITY_CLOSE_PX_MS = -0.45;
export const DRAWER_OPEN_PROGRESS_THRESHOLD = 0.35;
export const DRAWER_CLOSE_PROGRESS_THRESHOLD = 0.65;

export function getDrawerWidth(): number {
  if (typeof window === "undefined") return 360;
  return Math.min(window.innerWidth * 0.86, 360);
}

export function clampDrawerTranslateX(value: number, width: number): number {
  return Math.max(-width, Math.min(0, value));
}

export function drawerOpenProgress(translateX: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, (width + translateX) / width));
}
