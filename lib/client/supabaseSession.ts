"use client";

import { supabaseClient } from "@/lib/supabase/client";
import { clearAccessToken, setAccessToken } from "@/lib/client/apiSession";

/**
 * Bridges Supabase's persistent, auto-refreshing auth session with the app's
 * Bearer-token fetch layer (`campusquest_access_token` in localStorage).
 *
 * Login/signup happen server-side and return a full session (access +
 * refresh token). We hand that session to the browser Supabase client via
 * `setSession` so it persists the refresh token and silently refreshes the
 * access token forever. An `onAuthStateChange` listener mirrors the current
 * access token into the Bearer-token store so authed fetches always carry a
 * fresh JWT. The session is only cleared on an explicit sign-out.
 */

let authSyncAttached = false;

type PersistableSession = {
  access_token: string;
  refresh_token: string;
};

/**
 * Mirror Supabase's session into the Bearer-token store and keep it in sync as
 * the access token is auto-refreshed. Idempotent — safe to call on every mount.
 */
export function attachSupabaseAuthSync(): void {
  if (authSyncAttached || typeof window === "undefined") return;
  authSyncAttached = true;
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
      // Covers INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED.
      setAccessToken(session.access_token);
    } else if (event === "SIGNED_OUT") {
      clearAccessToken();
    }
  });
}

/**
 * Restore a persisted session on launch. supabase-js refreshes the access
 * token automatically when it has expired but the refresh token is still
 * valid, so a returned token here is always usable. Never clears an existing
 * Bearer token when no Supabase session is present, so users created before
 * this flow (token-only, no stored refresh token) are not logged out early.
 */
export async function restoreSupabaseSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return null;
    const token = data.session?.access_token ?? null;
    if (token) setAccessToken(token);
    return token;
  } catch {
    return null;
  }
}

/**
 * Persist a freshly issued session (immediately after login/signup) so it
 * survives reloads/app restarts and auto-refreshes from here on.
 */
export async function persistSupabaseSession(session: PersistableSession): Promise<void> {
  if (typeof window === "undefined") return;
  if (!session.access_token || !session.refresh_token) return;
  attachSupabaseAuthSync();
  try {
    await supabaseClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch {
    // Non-fatal: the Bearer token is still set by the caller; only background
    // auto-refresh would be unavailable until the next successful login.
  }
}

/**
 * Full sign-out: removes Supabase's persisted session (including the refresh
 * token) so the user stays logged out until they explicitly log in again.
 */
export async function signOutSupabaseSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await supabaseClient.auth.signOut();
  } catch {
    // Ignore — the caller still clears the local Bearer token and app state.
  }
}
