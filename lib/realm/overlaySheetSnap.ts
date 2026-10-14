export type OverlaySnap = "half" | "full";

/** Decide the next sheet snap from a vertical drag. Positive dy moves down. */
export function nextOverlaySnap(current: OverlaySnap, dy: number): OverlaySnap | "closed" {
  if (!Number.isFinite(dy)) return current;
  if (dy >= 150) return "closed";
  if (current === "full" && dy >= 56) return "half";
  if (current === "half" && dy >= 88) return "closed";
  if (dy <= -48) return "full";
  return current;
}
