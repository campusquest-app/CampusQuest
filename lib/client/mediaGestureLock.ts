/**
 * Ref-counted lock so post media can temporarily disable global tab-swipe
 * navigation without leaving it stuck if a gesture ends abruptly.
 */

export const MEDIA_GESTURE_LOCK_ATTR = "data-cq-media-gesture-lock";

let lockCount = 0;

function syncDomAttribute(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (lockCount > 0) {
    root.setAttribute(MEDIA_GESTURE_LOCK_ATTR, "true");
  } else {
    root.removeAttribute(MEDIA_GESTURE_LOCK_ATTR);
  }
}

/** Acquire a media gesture lock. Always pair with {@link unlockMediaGesture}. */
export function lockMediaGesture(): void {
  lockCount += 1;
  syncDomAttribute();
}

/** Release one media gesture lock (no-ops below zero). */
export function unlockMediaGesture(): void {
  lockCount = Math.max(0, lockCount - 1);
  syncDomAttribute();
}

/** Force-clear (tests / emergency). Prefer unlock pairing in app code. */
export function resetMediaGestureLock(): void {
  lockCount = 0;
  syncDomAttribute();
}

export function isMediaGestureLocked(): boolean {
  return lockCount > 0;
}
