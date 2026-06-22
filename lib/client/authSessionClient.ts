"use client";

import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";
import { invalidateMeSessionCache, resetMeSessionInflight } from "@/lib/client/meSessionCache";

export { AuthSessionMissingError, isMissingSessionError } from "@/lib/client/dashboardApi";

/** True when a non-empty access token is present in client storage. */
export function hasClientAccessSession(): boolean {
  return Boolean(getAccessToken());
}

/** Clear stale JWT and in-memory me session state after auth loss. */
export function clearStaleAuthClientState(): void {
  clearAccessToken();
  invalidateMeSessionCache();
  resetMeSessionInflight();
}
