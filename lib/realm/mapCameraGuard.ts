/**
 * Tracks whether the user has manually moved the map camera.
 * Programmatic pans (fly-to, fit-bounds, locate) are allowed only when
 * explicitly requested — never when marker/event data refreshes.
 */
let userHasMovedCamera = false;

export function markUserCameraInteraction(): void {
  userHasMovedCamera = true;
}

export function resetUserCameraInteraction(): void {
  userHasMovedCamera = false;
}

export function hasUserMovedCamera(): boolean {
  return userHasMovedCamera;
}

/** True when an automatic fly-to should be skipped (user already panned). */
export function shouldSkipAutomaticFlyTo(): boolean {
  return userHasMovedCamera;
}
