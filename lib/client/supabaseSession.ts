"use client";

import { supabaseClient } from "@/lib/supabase/client";
import { clearAccessToken, setAccessToken } from "@/lib/client/apiSession";
import {
  getClientAuthInitPromise,
  invalidateInvalidClientSession,
  isInvalidAuthError,
  markAuthCheckComplete,
  resetAuthCheckState,
  setClientAuthInitPromise,
} from "@/lib/client/invalidateAuthSession";

/**
 * Bridges Supabase's persistent, auto-refreshing auth session with the app's
 * Bearer-token fetch layer (`campusquest_access_token` in localStorage).
 */

let authSyncAttached = false;

type PersistableSession = {
  access_token: string;
  refresh_token: string;
};

const IS_DEV = process.env.NODE_ENV !== "production";

function logAuthDev(payload: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info("[cq:auth]", payload);
}

/**
 * Mirror Supabase's session into the Bearer-token store and keep it in sync as
 * the access token is auto-refreshed. Idempotent — safe to call once per app lifetime.
 */
export function attachSupabaseAuthSync(): void {
  if (authSyncAttached || typeof window === "undefined") return;
  authSyncAttached = true;

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session?.access_token) {
      setAccessToken(session.access_token);
      logAuthDev({ phase: "auth-state", event, hasSession: true });
      return;
    }

    if (event === "SIGNED_OUT") {
      clearAccessToken();
      logAuthDev({ phase: "auth-state", event, hasSession: false });
      return;
    }

    if (event === "TOKEN_REFRESHED" && !session) {
      await invalidateInvalidClientSession({
        reason: "token_refresh_missing_session",
      });
    }
  });
}

/**
 * Restore a persisted session on launch. Uses getSession only — never getUser().
 * Invalid JWT / expired refresh tokens trigger a one-time local cleanup.
 */
export async function restoreSupabaseSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      logAuthDev({
        phase: "restore",
        hasSession: false,
        authError: error.message,
        code: error.code ?? null,
      });
      if (isInvalidAuthError(error)) {
        await invalidateInvalidClientSession({ reason: error.message });
      }
      return null;
    }

    const token = data.session?.access_token ?? null;
    logAuthDev({
      phase: "restore",
      hasSession: Boolean(token),
    });

    if (token) {
      setAccessToken(token);
      return token;
    }
    return null;
  } catch (error) {
    logAuthDev({
      phase: "restore",
      hasSession: false,
      authError: error instanceof Error ? error.message : "unknown",
    });
    if (isInvalidAuthError(error)) {
      await invalidateInvalidClientSession({
        reason: error instanceof Error ? error.message : "restore_failed",
      });
    }
    return null;
  } finally {
    markAuthCheckComplete();
  }
}

/**
 * Initialize client auth once per app lifetime: attach sync + restore session.
 */
export function initClientAuth(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const pending = getClientAuthInitPromise();
  if (pending) return pending;

  if (IS_DEV) {
    logAuthDev({
      phase: "init",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    });
  }

  const promise = (async () => {
    attachSupabaseAuthSync();
    return restoreSupabaseSession();
  })();

  setClientAuthInitPromise(promise);
  return promise;
}

/**
 * Persist a freshly issued session (immediately after login/signup) so it
 * survives reloads/app restarts and auto-refreshes from here on.
 */
export async function persistSupabaseSession(session: PersistableSession): Promise<void> {
  if (typeof window === "undefined") return;
  if (!session.access_token || !session.refresh_token) return;
  attachSupabaseAuthSync();
  resetAuthCheckState();
  try {
    await supabaseClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    setAccessToken(session.access_token);
  } catch (error) {
    if (isInvalidAuthError(error)) {
      await invalidateInvalidClientSession({
        reason: error instanceof Error ? error.message : "set_session_failed",
      });
    }
  }
}

/**
 * Full sign-out: removes Supabase's persisted session (including the refresh
 * token) so the user stays logged out until they explicitly log in again.
 */
export async function signOutSupabaseSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await supabaseClient.auth.signOut({ scope: "local" });
  } catch {
    // Ignore — the caller still clears the local Bearer token and app state.
  }
  resetAuthCheckState();
}
