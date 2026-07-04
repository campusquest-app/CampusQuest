/** Light tap feedback when selecting a map marker (mobile). */
export function vibrateMapMarkerTap(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(10);
  } catch {
    /* optional */
  }
}
