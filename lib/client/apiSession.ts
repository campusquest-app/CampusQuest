"use client";

import { clearSchoolVerificationSnapshot } from "@/lib/client/schoolVerificationCache";

/** Matches `localStorage` key — used by admin route gate + cross-tab listeners. */
export const ACCESS_TOKEN_STORAGE_KEY = "campusquest_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    return token && token.trim().length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Covers same-tab races where JWT is written moments before an authed fetch
 * (e.g. SPA navigation immediately after login, or hydration ordering).
 */
export async function waitForClientAccessToken(maxMs = 600, stepMs = 40): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (getAccessToken()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return Boolean(getAccessToken());
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage errors so auth flow can continue.
  }
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors so logout still succeeds.
  }
  clearSchoolVerificationSnapshot();
}
