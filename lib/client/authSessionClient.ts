"use client";

import { clearAccessToken, getAccessToken } from "@/lib/client/apiSession";
import { invalidateMeSessionCache, resetMeSessionInflight } from "@/lib/client/meSessionCache";

export { AuthSessionMissingError, isMissingSessionError } from "@/lib/client/dashboardApi";
export {
  AUTH_SESSION_EXPIRED_MESSAGE,
  AUTH_SESSION_EXPIRED_NOTICE_KEY,
  invalidateInvalidClientSession,
  isInvalidAuthError,
  registerInvalidSessionListener,
} from "@/lib/client/invalidateAuthSession";

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
