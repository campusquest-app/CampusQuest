/**
 * iOS/WebKit can deliver a delayed click after pointerup. Ember awards
 * remount the post card, so that click can land on the full-width Likes row.
 */
const SUPPRESS_MS = 480;
let suppressUntil = 0;

export function markEmberInteraction(): void {
  suppressUntil = Date.now() + SUPPRESS_MS;
}

export function wasRecentEmberInteraction(): boolean {
  return Date.now() < suppressUntil;
}

export function shouldIgnoreLikersOpen(): boolean {
  return wasRecentEmberInteraction();
}
