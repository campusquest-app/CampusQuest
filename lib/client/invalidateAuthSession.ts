"use client";

import { clearAccessToken } from "@/lib/client/apiSession";
import { invalidateMeSessionCache, resetMeSessionInflight } from "@/lib/client/meSessionCache";
import { supabaseClient } from "@/lib/supabase/client";

export const AUTH_SESSION_EXPIRED_NOTICE_KEY = "cq_auth_session_expired_notice";
export const AUTH_SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";

const IS_DEV = process.env.NODE_ENV !== "production";

let invalidSessionCleanupInFlight = false;
let clientAuthInitPromise: Promise<string | null> | null = null;
let hasCheckedAuth = false;

type InvalidSessionListener = (message: string) => void;
let invalidSessionListener: InvalidSessionListener | null = null;

export function registerInvalidSessionListener(listener: InvalidSessionListener): () => void {
  invalidSessionListener = listener;
  return () => {
    if (invalidSessionListener === listener) invalidSessionListener = null;
  };
}

export function hasCompletedAuthCheck(): boolean {
  return hasCheckedAuth;
}

export function markAuthCheckComplete(): void {
  hasCheckedAuth = true;
}

export function resetAuthCheckState(): void {
  hasCheckedAuth = false;
  clientAuthInitPromise = null;
}

function logAuthDev(payload: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info("[cq:auth]", payload);
}

export function isInvalidAuthError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  } else if (typeof error === "string") {
    parts.push(error);
  } else if (error && typeof error === "object") {
    if ("message" in error) parts.push(String((error as { message?: unknown }).message ?? ""));
    if ("code" in error) parts.push(String((error as { code?: unknown }).code ?? ""));
    if ("status" in error) parts.push(String((error as { status?: unknown }).status ?? ""));
  }
  const haystack = parts.join(" ").toLowerCase();
  return (
    haystack.includes("bad jwt") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt expired") ||
    haystack.includes("authsessionmissingerror") ||
    haystack.includes("invalid claim") ||
    haystack.includes("token is expired") ||
    haystack.includes("session_not_found") ||
    (haystack.includes("403") && haystack.includes("jwt"))
  );
}

/** Remove Supabase auth keys persisted by supabase-js in localStorage. */
export function clearSupabaseAuthStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures during cleanup.
  }
}

export type InvalidateAuthSessionOptions = {
  reason?: string;
  message?: string;
  notify?: boolean;
};

/**
 * Clears invalid Supabase + CampusQuest client auth state once.
 * Safe to call from 401 handlers, bootstrap, and Supabase session restore.
 */
export async function invalidateInvalidClientSession(
  options?: InvalidateAuthSessionOptions,
): Promise<void> {
  if (invalidSessionCleanupInFlight) return;
  invalidSessionCleanupInFlight = true;

  const message = options?.message ?? AUTH_SESSION_EXPIRED_MESSAGE;

  try {
    logAuthDev({
      phase: "invalidate",
      reason: options?.reason ?? null,
      hasSession: false,
    });

    try {
      await supabaseClient.auth.signOut({ scope: "local" });
    } catch {
      // Local cleanup continues even if signOut fails.
    }

    clearAccessToken();
    clearSupabaseAuthStorage();
    invalidateMeSessionCache();
    resetMeSessionInflight();
    resetAuthCheckState();

    if (options?.notify !== false && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(AUTH_SESSION_EXPIRED_NOTICE_KEY, message);
      } catch {
        // Ignore storage errors.
      }
      invalidSessionListener?.(message);
    }
  } finally {
    invalidSessionCleanupInFlight = false;
  }
}

export function getClientAuthInitPromise(): Promise<string | null> | null {
  return clientAuthInitPromise;
}

export function setClientAuthInitPromise(promise: Promise<string | null> | null): void {
  clientAuthInitPromise = promise;
}
