"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { AuthPasswordRequirementsHints } from "@/components/auth/AuthPasswordRequirementsHints";
import { AuthScrollShell } from "@/components/auth/AuthScrollShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { clearAccessToken } from "@/lib/client/apiSession";
import { parseAuthCallbackParams } from "@/lib/client/authCallbackErrors";
import { isNativeCapacitorApp } from "@/lib/client/capacitorNative";
import {
  clearPasswordResetPending,
  hasRecoveryCredentials,
  nativePasswordResetHandoffUrl,
  PASSWORD_RESET_SUCCESS_PARAM,
  passwordResetFormError,
  passwordResetLinkFailure,
  shouldOfferNativePasswordResetHandoff,
} from "@/lib/client/passwordResetFlow";
import { clearPersistedSupabaseAuthStorage } from "@/lib/client/supabaseSession";
import { supabaseClient } from "@/lib/supabase/client";

async function establishRecoverySession(): Promise<boolean> {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) return true;
  const params = parseAuthCallbackParams({
    search: window.location.search,
    hash: window.location.hash,
  });
  if (params.access_token && params.refresh_token) {
    const { error } = await supabaseClient.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return !error;
  }
  if (params.code) {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(params.code);
    return !error;
  }
  return false;
}

export function ResetPasswordClient() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nativeHandoff, setNativeHandoff] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      const params = parseAuthCallbackParams({
        search: window.location.search,
        hash: window.location.hash,
      });
      const failure = passwordResetLinkFailure(params);
      if (failure) {
        if (!cancelled) setLinkError(failure);
        return;
      }
      if (!hasRecoveryCredentials(params)) {
        const { data } = await supabaseClient.auth.getSession();
        if (cancelled) return;
        if (data.session) setReady(true);
        else setLinkError("This reset link is no longer valid. Request a new password reset email.");
        return;
      }
      if (
        shouldOfferNativePasswordResetHandoff({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          nativeApp: isNativeCapacitorApp(),
        })
      ) {
        setNativeHandoff(nativePasswordResetHandoffUrl(window.location.search, window.location.hash));
      }
      if (!cancelled) setReady(true);
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const formError = passwordResetFormError(password, confirmation);
    if (formError) {
      setError(formError);
      return;
    }
    setBusy(true);
    setError(null);
    const established = await establishRecoverySession();
    if (!established) {
      setBusy(false);
      setLinkError("This reset link is no longer valid. It may have expired or already been used.");
      return;
    }
    const { error: updateError } = await supabaseClient.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError("Could not update that password. Request a new reset link and try again.");
      return;
    }
    await supabaseClient.auth.signOut({ scope: "local" });
    clearPersistedSupabaseAuthStorage();
    clearAccessToken();
    clearPasswordResetPending();
    window.location.replace(`/?${PASSWORD_RESET_SUCCESS_PARAM}=1`);
  }

  return (
    <AuthScrollShell className="cq-auth-shell flex flex-col items-center px-5 py-6">
      <div className="cq-auth-inner cq-auth-enter w-full">
        <div className="cq-auth-header flex flex-col items-center text-center">
          <CampusQuestLogo variant="auth" priority className="mb-3" />
          <h1 className="cq-auth-brand-title font-display">Reset password</h1>
        </div>
        {linkError ? (
          <div className="cq-auth-form-panel mt-6 space-y-4">
            <p className="cq-auth-error">{linkError}</p>
            <a href="/" className="cq-auth-btn-primary inline-flex w-full items-center justify-center">
              Back to sign in
            </a>
          </div>
        ) : ready ? (
          <form className="cq-auth-form-panel mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <p className="text-sm text-white/70">Choose a new password. You will sign in again after it is saved.</p>
            <label className="cq-auth-label" htmlFor="reset-password">
              New password
            </label>
            <PasswordInput
              id="reset-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <AuthPasswordRequirementsHints password={password} />
            <label className="cq-auth-label" htmlFor="reset-password-confirm">
              Confirm password
            </label>
            <PasswordInput
              id="reset-password-confirm"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
            {error ? <p className="cq-auth-error">{error}</p> : null}
            <button type="submit" className="cq-auth-btn-primary w-full" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </button>
            {nativeHandoff ? (
              <a className="cq-auth-link" href={nativeHandoff}>
                Continue in the CampusQuest app
              </a>
            ) : null}
          </form>
        ) : (
          <p className="cq-auth-notice mt-6" role="status">
            Checking this reset link…
          </p>
        )}
      </div>
    </AuthScrollShell>
  );
}
