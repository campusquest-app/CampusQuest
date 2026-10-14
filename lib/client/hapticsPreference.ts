const HAPTICS_KEY = "campusquest_haptics_enabled";

export function hapticsSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}

/** Default on. A stored "0" means the user turned vibration off. */
export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(HAPTICS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.removeItem(HAPTICS_KEY);
    else window.localStorage.setItem(HAPTICS_KEY, "0");
  } catch {
    /* private mode */
  }
}

/** Vibration that follows the Sound & Haptics preference. */
export function pulseHaptic(pattern: number | number[]): void {
  if (!isHapticsEnabled()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}
