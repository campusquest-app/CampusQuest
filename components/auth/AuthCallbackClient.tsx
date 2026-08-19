"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { persistSupabaseSession } from "@/lib/client/supabaseSession";
import { setAccessToken } from "@/lib/client/apiSession";
import { mapAuthCallbackError, parseAuthCallbackParams } from "@/lib/client/authCallbackErrors";
import { AuthEmailRecoveryCard } from "@/components/auth/AuthEmailRecoveryCard";
import {
  canAttemptResend,
  formatResendCooldownLabel,
  readResendCooldownState,
  remainingResendCooldownMs,
  startResendCooldown,
  writeResendCooldownState,
} from "@/lib/client/authResendCooldown";
import { AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import { mapAuthEmailActionError, HttpRequestError } from "@/lib/client/authErrorMessages";

export function AuthCallbackClient() {
  const router = useRouter();
  const [recovery, setRecovery] = useState(() => {
    if (typeof window === "undefined") return null;
    return mapAuthCallbackError(parseAuthCallbackParams({ search: window.location.search, hash: window.location.hash }));
  });
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlightRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (recovery) return;
    let cancelled = false;

    void (async () => {
      const params = parseAuthCallbackParams({
        search: window.location.search,
        hash: window.location.hash,
      });
      const mapped = mapAuthCallbackError(params);
      if (mapped) {
        if (!cancelled) setRecovery(mapped);
        return;
      }

      const code = params.code;
      if (code) {
        const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setRecovery(
              mapAuthCallbackError({ error: error.message, error_code: error.code ?? "access_denied" }) ?? {
                code: "auth_callback_failed",
                title: "We couldn't finish email verification",
                message: "Request a new verification email, then open the latest link on this device.",
                allowResend: true,
              },
            );
          }
          return;
        }
        if (data.session?.access_token && data.session.refresh_token) {
          await persistSupabaseSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        } else if (data.session?.access_token) {
          setAccessToken(data.session.access_token);
        }
        if (!cancelled) router.replace("/");
        return;
      }

      const { data } = await supabaseClient.auth.getSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
        if (!cancelled) router.replace("/");
        return;
      }

      if (!cancelled) {
        setRecovery({
          code: "auth_callback_missing_session",
          title: "We couldn't finish email verification",
          message: "Request a new verification email, then open the latest link on this device.",
          allowResend: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recovery, router]);

  const stored = readResendCooldownState();
  const remaining = remainingResendCooldownMs({ email, nowMs, stored });
  const resendDisabled = sending || remaining > 0 || !email.trim();

  async function handleResend() {
    if (inFlightRef.current) return;
    if (!canAttemptResend({ email, nowMs: Date.now(), stored: readResendCooldownState(), inFlight: false })) {
      setNotice(formatResendCooldownLabel(remaining || 1000));
      return;
    }
    inFlightRef.current = true;
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      if (!response.ok) {
        throw new HttpRequestError(
          payload.error?.message ?? "Request failed.",
          "/api/auth/resend-confirmation",
          response.status,
          response.statusText,
          payload.error?.code,
        );
      }
      writeResendCooldownState(startResendCooldown({ email, nowMs: Date.now() }));
      setNotice(AUTH_EMAIL_USER_MESSAGES.accepted);
    } catch (error) {
      setNotice(mapAuthEmailActionError(error));
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }

  if (!recovery) {
    return (
      <div className="cq-auth-shell min-h-[100dvh] flex items-center justify-center px-5">
        <p className="text-sm text-white/70">Finishing email verification…</p>
      </div>
    );
  }

  return (
    <div className="cq-auth-shell min-h-[100dvh] flex flex-col items-center px-5 py-6">
      <div className="cq-auth-inner w-full max-w-md">
        <AuthEmailRecoveryCard
          recovery={recovery}
          email={email}
          onEmailChange={setEmail}
          onResend={() => void handleResend()}
          resendLabel={
            sending ? "Sending..." : remaining > 0 ? formatResendCooldownLabel(remaining) : "Send a new verification email"
          }
          resendDisabled={resendDisabled}
          notice={notice}
        />
      </div>
    </div>
  );
}
