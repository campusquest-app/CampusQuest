"use client";

const ACCESS_TOKEN_KEY = "campusquest_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token && token.trim().length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors so auth flow can continue.
  }
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Ignore storage errors so logout still succeeds.
  }
}
