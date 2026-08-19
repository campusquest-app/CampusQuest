"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { fetchMeSchoolVerification, SchoolVerificationHttpError } from "@/lib/client/dashboardApi";
import { canAccessCampusFromSnapshot } from "@/lib/client/campusAccess";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/client/apiSession";
import { persistSupabaseSession } from "@/lib/client/supabaseSession";
import { mustRedirectToAgreement, type LegalConsentPayload } from "@/lib/client/agreementAccess";
import { LegalConsentScreen } from "@/components/LegalConsentScreen";
import { AccountSafetyStatusScreen } from "@/components/AccountSafetyStatusScreen";
import { SchoolVerificationScreen } from "@/components/SchoolVerificationScreen";
import { AuthOnboardingFlow } from "@/components/auth/AuthOnboardingFlow";
import { isOnboardingTutorialDisabled } from "@/lib/client/onboardingTutorialGating";
import { dismissOnboardingTutorialOnServer } from "@/lib/client/dismissOnboardingTutorial";
import { resetMobileViewportScale } from "@/lib/client/modalViewportCleanup";
import { AuthPasswordRequirementsAlert } from "@/components/auth/AuthPasswordRequirementsAlert";
import { AuthPasswordRequirementsHints } from "@/components/auth/AuthPasswordRequirementsHints";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { AuthModeSegment } from "@/components/auth/AuthModeSegment";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";
import {
  AUTH_SESSION_EXPIRED_NOTICE_KEY,
} from "@/lib/client/invalidateAuthSession";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

import {
  HttpRequestError,
  mapAuthEmailActionError,
  mapGenericError,
  mapSigninError,
  mapSignupError,
} from "@/lib/client/authErrorMessages";
import { AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import {
  canAttemptResend,
  formatResendCooldownLabel,
  readResendCooldownState,
  remainingResendCooldownMs,
  startResendCooldown,
  writeResendCooldownState,
} from "@/lib/client/authResendCooldown";
import { mapAuthCallbackError, parseAuthCallbackParams } from "@/lib/client/authCallbackErrors";
import { AuthEmailRecoveryCard } from "@/components/auth/AuthEmailRecoveryCard";
import { syncOnboardingQaReplayFromAccessToken } from "@/lib/client/onboardingQaSession";
import { isAllowedSignupEmail, SCHOOL_EMAIL_REQUIRED_MESSAGE } from "@/lib/signupEmailPolicy";

type Mode = "welcome" | "signin" | "signup";
type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } | string };
const REMEMBER_EMAIL_KEY = "cq_auth_remember_email";
const SIGNUP_COOLDOWN_MS = 3000;

const IS_DEV =
  typeof process !== "undefined" && process.env.NODE_ENV !== "production";

/** Surface the real Supabase/API error in development without exposing it to users. */
function logAuthClientError(context: string, error: unknown): void {
  if (!IS_DEV) return;
  if (error instanceof HttpRequestError) {
    console.error(
      `[auth:${context}] ${error.status} ${error.statusText} ${error.path}`,
      { message: error.message, code: error.code ?? null },
    );
  } else if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    console.error(`[auth:${context}] network error reaching`, error.message.slice("NETWORK_ERROR:".length));
  } else if (error instanceof Error) {
    console.error(`[auth:${context}]`, error.message);
  } else {
    console.error(`[auth:${context}]`, error);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(`NETWORK_ERROR:${path}`);
  }
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    const apiError = payload?.error;
    const message =
      typeof apiError === "string"
        ? apiError
        : apiError?.message ?? "Request failed.";
    const code = typeof apiError === "string" ? undefined : apiError?.code;
    throw new HttpRequestError(message, path, response.status, response.statusText || "Unknown", code);
  }
  return payload;
}

function AuthHeader() {
  return (
    <div className="cq-auth-header flex flex-col items-center text-center">
      <CampusQuestLogo variant="auth" priority className="mb-3" />
      <h1 className="cq-auth-brand-title font-display">
        CampusQuest
      </h1>
      <p className="cq-auth-subtitle mt-2 max-w-[18rem]">Discover campus. Find opportunities. Get involved.</p>
    </div>
  );
}

const AUTH_PANEL_VARIANTS = {
  enter: (m: Mode) => ({ opacity: 0, x: m === "signup" ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (m: Mode) => ({ opacity: 0, x: m === "signup" ? -28 : 28 }),
};

export function AuthScreen({ onComplete }: { onComplete: () => void }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("welcome");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordRequirementsError, setShowPasswordRequirementsError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
  const [nowMs, setNowMs] = useState(() => (typeof Date !== "undefined" ? Date.now() : 0));
  const [callbackRecovery, setCallbackRecovery] = useState(() => {
    if (typeof window === "undefined") return null;
    return mapAuthCallbackError(parseAuthCallbackParams({ search: window.location.search, hash: window.location.hash }));
  });
  const resendInFlightRef = useRef(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPostSignupOnboarding, setShowPostSignupOnboarding] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [isConsentSubmitting, setIsConsentSubmitting] = useState(false);
  const [safetyBlock, setSafetyBlock] = useState<{
    status: "suspended" | "banned";
    reason?: string | null;
    suspendedUntil?: string | null;
  } | null>(null);
  const [schoolVerificationBlock, setSchoolVerificationBlock] = useState<{
    requiredSchoolName: string;
    requiredSchoolDomain: string | null;
    currentDomain: string | null;
  } | null>(null);
  const signupLockedRef = useRef(false);
  const lastSignupAttemptRef = useRef(0);
  const loginLockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const expiredNotice = sessionStorage.getItem(AUTH_SESSION_EXPIRED_NOTICE_KEY);
    if (expiredNotice) {
      sessionStorage.removeItem(AUTH_SESSION_EXPIRED_NOTICE_KEY);
      setNotice(expiredNotice);
      setMode("signin");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!callbackRecovery) return;
    if (window.location.hash || window.location.search.includes("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [callbackRecovery]);

  async function checkSafetyStatus(accessToken: string) {
    const payload = await fetchJson<{
      status?: "active" | "suspended" | "banned";
      reason?: string | null;
      suspendedUntil?: string | null;
    }>("/api/me/safety-status", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const status = payload?.data?.status;
    if (status === "suspended" || status === "banned") {
      setSafetyBlock({
        status,
        reason: payload?.data?.reason ?? null,
        suspendedUntil: payload?.data?.suspendedUntil ?? null,
      });
      return false;
    }
    setSafetyBlock(null);
    return true;
  }

  const checkConsentStatus = useCallback(async (accessToken: string) => {
    const payload = await fetchJson<LegalConsentPayload & { currentPolicyVersion?: string }>(
      "/api/legal/consent/status",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    const d = payload?.data;
    const currentPolicyVersion = d?.currentPolicyVersion ?? DEFAULT_POLICY_VERSION;
    setConsentVersion(currentPolicyVersion);
    if (mustRedirectToAgreement(d)) {
      setNeedsConsent(true);
      return false;
    }
    setNeedsConsent(false);
    return true;
  }, []);

  async function checkSchoolVerification(accessToken: string) {
    const snapshot = await fetchMeSchoolVerification(accessToken);
    const allowed = canAccessCampusFromSnapshot(snapshot);
    if (!allowed) {
      const { verification } = snapshot;
      setSchoolVerificationBlock({
        requiredSchoolName: verification.requiredPilotSchoolName ?? "your school",
        requiredSchoolDomain: verification.requiredPilotDomain ?? null,
        currentDomain: verification.schoolDomain ?? null,
      });
      return false;
    }
    setSchoolVerificationBlock(null);
    return true;
  }

  async function completeAuthenticatedSession(opts: { isSignup: boolean }) {
    const token = getAccessToken();
    if (!token) return;
    const canUseAccount = await checkSafetyStatus(token);
    if (!canUseAccount) return;
    const canContinue = await checkConsentStatus(token);
    if (!canContinue) return;
    const verifiedForCampus = await checkSchoolVerification(token);
    if (!verifiedForCampus) return;

    if (opts.isSignup && !isOnboardingTutorialDisabled()) {
      setShowPostSignupOnboarding(true);
      return;
    }

    if (opts.isSignup) {
      void dismissOnboardingTutorialOnServer();
    }

    resetMobileViewportScale();
    setSuccessBanner(opts.isSignup ? "Welcome to CampusQuest!" : "Welcome Back!");
    window.setTimeout(() => {
      resetMobileViewportScale();
      onComplete();
    }, 700);
  }

  async function handleConsentContinue() {
    setIsConsentSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");
      await fetchJson("/api/legal/consent/accept", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acceptedTerms: true, acceptedPrivacy: true, acceptedGuidelines: true }),
      });
      setNeedsConsent(false);
      const verifiedForCampus = await checkSchoolVerification(token);
      if (verifiedForCampus) onComplete();
    } catch (consentError) {
      if (consentError instanceof SchoolVerificationHttpError) {
        if (consentError.status === 401) clearAccessToken();
        setError(consentError.message);
      } else {
        setError(mapGenericError(consentError));
      }
    } finally {
      setIsConsentSubmitting(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || loginLockedRef.current) return;
    setError(null);
    setNotice(null);
    setSuccessBanner(null);
    const eVal = email.trim().toLowerCase();
    const p = password.trim();
    if (!eVal || !p) {
      setError("Enter your email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eVal)) {
      setError("Invalid email address.");
      return;
    }

    loginLockedRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = await fetchJson<{ session?: { access_token?: string; refresh_token?: string } }>(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: eVal, password: p }),
        },
      );
      const session = payload?.data?.session;
      const accessToken = session?.access_token;
      if (!accessToken) {
        if (IS_DEV) {
          console.error("[auth:login] succeeded (2xx) but no session/access_token in response", payload);
        }
        setError("We couldn't start your session. Please try again.");
        return;
      }
      if (rememberMe && typeof window !== "undefined") {
        localStorage.setItem(REMEMBER_EMAIL_KEY, eVal);
      } else if (typeof window !== "undefined") {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
      setAccessToken(accessToken);
      if (session?.refresh_token) {
        await persistSupabaseSession({ access_token: accessToken, refresh_token: session.refresh_token });
      }
      syncOnboardingQaReplayFromAccessToken(accessToken);
      await completeAuthenticatedSession({ isSignup: false });
    } catch (signInError) {
      logAuthClientError("login", signInError);
      if (signInError instanceof SchoolVerificationHttpError) {
        if (signInError.status === 401) clearAccessToken();
        setError(signInError.message);
        return;
      }
      setError(mapSigninError(signInError));
    } finally {
      setIsSubmitting(false);
      window.setTimeout(() => {
        loginLockedRef.current = false;
      }, SIGNUP_COOLDOWN_MS);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || signupLockedRef.current) return;
    const now = Date.now();
    if (now - lastSignupAttemptRef.current < SIGNUP_COOLDOWN_MS) return;
    setError(null);
    setShowPasswordRequirementsError(false);
    setNotice(null);
    setSuccessBanner(null);
    const eVal = email.trim().toLowerCase();
    const u = username.trim().toLowerCase();
    const p = password.trim();
    const cp = confirmPassword.trim();
    if (!eVal || !u || !p || !cp) {
      setError("Fill in all fields to create your account.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eVal)) {
      setError("Invalid email address.");
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      setError("Username must be 3-24 characters (a-z, 0-9, _).");
      return;
    }
    if (!isAllowedSignupEmail(eVal)) {
      setError(SCHOOL_EMAIL_REQUIRED_MESSAGE);
      return;
    }
    if (!passwordMeetsRequirements(p)) {
      setShowPasswordRequirementsError(true);
      return;
    }
    if (p !== cp) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    signupLockedRef.current = true;
    lastSignupAttemptRef.current = now;
    setIsSubmitting(true);
    try {
      const payload = await fetchJson<{
        session?: { access_token?: string; refresh_token?: string };
        user?: { id?: string };
      }>("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: eVal, password: p, username: u }),
      });
      const session = payload?.data?.session;
      const accessToken = session?.access_token;
      if (!accessToken) {
        setMode("signin");
        setEmail(eVal);
        setPassword("");
        setConfirmPassword("");
        setSuccessBanner("Account Created!");
        setNotice(
          FEATURE_FLAGS.requireEmailVerification
            ? "Check your URI email to confirm your account before signing in."
            : "Sign in with your password to continue.",
        );
        return;
      }
      setAccessToken(accessToken);
      if (session?.refresh_token) {
        await persistSupabaseSession({ access_token: accessToken, refresh_token: session.refresh_token });
      }
      setSuccessBanner("Account Created!");
      await completeAuthenticatedSession({ isSignup: true });
    } catch (signUpError) {
      logAuthClientError("signup", signUpError);
      if (signUpError instanceof SchoolVerificationHttpError) {
        if (signUpError.status === 401) clearAccessToken();
        setError(signUpError.message);
        return;
      }
      const mapped = mapSignupError(signUpError);
      if ("passwordRequirements" in mapped) {
        setShowPasswordRequirementsError(true);
        setError(null);
        return;
      }
      setShowPasswordRequirementsError(false);
      setError(mapped.message);
    } finally {
      setIsSubmitting(false);
      window.setTimeout(() => {
        signupLockedRef.current = false;
      }, SIGNUP_COOLDOWN_MS);
    }
  }

  async function handleResetPassword() {
    const targetEmail = email.trim().toLowerCase();
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setNotice("Enter a valid email address to reset your password.");
      return;
    }
    setIsResettingPassword(true);
    try {
      await fetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      setNotice(AUTH_EMAIL_USER_MESSAGES.resetAccepted);
    } catch (resetError) {
      setNotice(mapAuthEmailActionError(resetError));
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleResendConfirmation() {
    const targetEmail = email.trim().toLowerCase();
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setNotice("Enter a valid email address.");
      return;
    }
    if (resendInFlightRef.current || isResendingConfirmation) return;
    const stored = readResendCooldownState();
    if (!canAttemptResend({ email: targetEmail, nowMs: Date.now(), stored, inFlight: false })) {
      const remaining = remainingResendCooldownMs({ email: targetEmail, nowMs: Date.now(), stored });
      setNotice(formatResendCooldownLabel(remaining || 1000));
      return;
    }
    resendInFlightRef.current = true;
    setIsResendingConfirmation(true);
    try {
      await fetchJson("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const next = startResendCooldown({ email: targetEmail, nowMs: Date.now() });
      writeResendCooldownState(next);
      setNotice(AUTH_EMAIL_USER_MESSAGES.accepted);
    } catch (resendError) {
      setNotice(mapAuthEmailActionError(resendError));
    } finally {
      resendInFlightRef.current = false;
      setIsResendingConfirmation(false);
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setShowPasswordRequirementsError(false);
    setNotice(null);
    setSuccessBanner(null);
    setPassword("");
    setConfirmPassword("");
  }

  if (needsConsent) {
    return (
      <LegalConsentScreen
        onContinue={handleConsentContinue}
        isSubmitting={isConsentSubmitting}
        versionLabel={consentVersion ?? DEFAULT_POLICY_VERSION}
      />
    );
  }

  if (safetyBlock) {
    return (
      <AccountSafetyStatusScreen
        status={safetyBlock.status}
        reason={safetyBlock.reason}
        suspendedUntil={safetyBlock.suspendedUntil}
      />
    );
  }

  if (schoolVerificationBlock) {
    return (
      <SchoolVerificationScreen
        requiredSchoolName={schoolVerificationBlock.requiredSchoolName}
        requiredSchoolDomain={schoolVerificationBlock.requiredSchoolDomain}
        currentDomain={schoolVerificationBlock.currentDomain}
        onUseDifferentAccount={() => {
          clearAccessToken();
          setSchoolVerificationBlock(null);
          switchMode("signin");
          setEmail("");
          setError(null);
        }}
      />
    );
  }

  if (showPostSignupOnboarding && !isOnboardingTutorialDisabled()) {
    return (
      <AuthOnboardingFlow
        onComplete={onComplete}
        onRequestSignIn={() => {
          clearAccessToken();
          setShowPostSignupOnboarding(false);
          switchMode("signin");
        }}
      />
    );
  }

  const resendRemaining = remainingResendCooldownMs({
    email,
    nowMs,
    stored: readResendCooldownState(),
  });
  const resendLocked = isResendingConfirmation || resendRemaining > 0;
  const showResend =
    FEATURE_FLAGS.requireEmailVerification ||
    Boolean(error?.toLowerCase().includes("confirm")) ||
    Boolean(notice?.toLowerCase().includes("confirm")) ||
    Boolean(notice && notice === AUTH_EMAIL_USER_MESSAGES.accepted) ||
    Boolean(successBanner === "Account Created!");

  if (callbackRecovery) {
    return (
      <div className="cq-auth-shell min-h-[100dvh] flex flex-col items-center px-5 py-6">
        <div className="cq-auth-inner cq-auth-enter w-full">
          <AuthHeader />
          <AuthEmailRecoveryCard
            recovery={callbackRecovery}
            email={email}
            onEmailChange={setEmail}
            onResend={() => void handleResendConfirmation()}
            resendLabel={
              isResendingConfirmation
                ? "Sending..."
                : resendRemaining > 0
                  ? formatResendCooldownLabel(resendRemaining)
                  : "Send a new verification email"
            }
            resendDisabled={resendLocked || !email.trim()}
            notice={notice}
          />
          <p className="cq-auth-switch-row">
            <button
              type="button"
              onClick={() => {
                setCallbackRecovery(null);
                setMode("signin");
              }}
              className="cq-auth-link"
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (mode === "welcome") {
    return (
      <div className="cq-onboard-shell cq-onboard-shell--dark">
        <div className="cq-onboard-inner">
          <div className="cq-onboard-hero text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo/campusquest-logo-official.png"
              alt="CampusQuest"
              className="cq-onboard-logo"
              width={88}
              height={88}
              decoding="async"
            />
            <div className="cq-onboard-knight" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/knight/thumbs-up.png"
                alt=""
                className="cq-onboard-knight-img"
                width={220}
                height={220}
                decoding="async"
              />
            </div>
            <h1 className="cq-onboard-title-dark">
              Welcome to <span className="cq-onboard-title-accent">CampusQuest</span>
            </h1>
            <p className="cq-onboard-sub-dark">
              Your campus. Your community.
              <br />
              Your quest.
            </p>
            <button type="button" className="cq-onboard-btn-gold" onClick={() => switchMode("signup")}>
              Let&apos;s Get Started
            </button>
            <p className="cq-onboard-footer-link">
              Already have an account?{" "}
              <button type="button" className="cq-onboard-text-link" onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cq-auth-shell min-h-[100dvh] flex flex-col items-center px-5 py-6">
      <div className="cq-auth-inner cq-auth-enter w-full">
        <AuthHeader />
        <AuthModeSegment
          mode={mode === "signin" ? "signin" : "signup"}
          onChange={(next) => switchMode(next)}
        />

        <div className="cq-auth-form-stage">
          <AnimatePresence mode="wait" initial={false} custom={mode}>
            {mode === "signin" ? (
              <motion.div
                key="signin"
                custom="signin"
                role="tabpanel"
                id="auth-panel-signin"
                aria-labelledby="auth-tab-signin"
                className="cq-auth-form-panel"
                variants={AUTH_PANEL_VARIANTS}
                initial={reduceMotion ? false : "enter"}
                animate="center"
                exit={reduceMotion ? undefined : "exit"}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label htmlFor="auth-email-signin" className="cq-auth-label">
                      Email Address
                    </label>
                    <input
                      id="auth-email-signin"
                      type="email"
                      autoComplete="username email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@uri.edu"
                      className="cq-auth-input"
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label htmlFor="auth-password-signin" className="cq-auth-label mb-0">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleResetPassword()}
                        disabled={isResettingPassword}
                        className="cq-auth-link text-[11px]"
                      >
                        {isResettingPassword ? "Sending..." : "Forgot Password?"}
                      </button>
                    </div>
                    <PasswordInput
                      id="auth-password-signin"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 text-sm text-white/55">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-white/25 bg-white/10 accent-sky-400"
                    />
                    Remember Me
                  </label>
                  {error ? <p className="cq-auth-error">{error}</p> : null}
                  {successBanner ? <p className="cq-auth-success">{successBanner}</p> : null}
                  {notice ? <p className="cq-auth-notice">{notice}</p> : null}
                  <button type="submit" disabled={isSubmitting} className="cq-auth-btn-primary w-full">
                    {isSubmitting ? "Signing In..." : "Sign In"}
                  </button>
                  <p className="cq-auth-trust pt-1">
                    {FEATURE_FLAGS.requireEmailVerification
                    ? "Secure sign-in · Email verification supported"
                    : "Secure sign-in"}
                  </p>
                  {showResend ? (
                    <button
                      type="button"
                      onClick={() => void handleResendConfirmation()}
                      disabled={resendLocked}
                      className="cq-auth-link w-full text-center"
                    >
                      {isResendingConfirmation
                        ? "Sending..."
                        : resendRemaining > 0
                          ? formatResendCooldownLabel(resendRemaining)
                          : "Resend verification email"}
                    </button>
                  ) : null}
                </form>
                <p className="cq-auth-switch-row">
                  Don&apos;t have an account?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className="cq-auth-link">
                    Sign Up
                  </button>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                custom="signup"
                role="tabpanel"
                id="auth-panel-signup"
                aria-labelledby="auth-tab-signup"
                className="cq-auth-form-panel"
                variants={AUTH_PANEL_VARIANTS}
                initial={reduceMotion ? false : "enter"}
                animate="center"
                exit={reduceMotion ? undefined : "exit"}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
              >
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <label htmlFor="auth-email-signup" className="cq-auth-label">
                      Email Address
                    </label>
                    <input
                      id="auth-email-signup"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@uri.edu"
                      className="cq-auth-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-password-signup" className="cq-auth-label">
                      Password
                    </label>
                    <PasswordInput
                      id="auth-password-signup"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (showPasswordRequirementsError) setShowPasswordRequirementsError(false);
                      }}
                      placeholder="••••••••"
                      aria-invalid={showPasswordRequirementsError}
                      aria-describedby="auth-password-requirements"
                    />
                    <div id="auth-password-requirements">
                      <AuthPasswordRequirementsHints password={password} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="auth-confirm-password" className="cq-auth-label">
                      Confirm Password
                    </label>
                    <PasswordInput
                      id="auth-confirm-password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-username-signup" className="cq-auth-label">
                      Username
                    </label>
                    <input
                      id="auth-username-signup"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="your_username"
                      className="cq-auth-input"
                    />
                  </div>
                  <label className="cq-auth-terms">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                    />
                    <span>
                      I agree to the{" "}
                      <Link href="/legal/terms" className="cq-auth-link">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/legal/privacy" className="cq-auth-link">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                  {showPasswordRequirementsError ? <AuthPasswordRequirementsAlert /> : null}
                  {error ? <p className="cq-auth-error">{error}</p> : null}
                  {successBanner ? <p className="cq-auth-success">{successBanner}</p> : null}
                  {notice ? <p className="cq-auth-notice">{notice}</p> : null}
                  <button type="submit" disabled={isSubmitting} className="cq-auth-btn-primary w-full">
                    {isSubmitting ? "Finishing account…" : "Create Account"}
                  </button>
                </form>
                <p className="cq-auth-switch-row">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchMode("signin")} className="cq-auth-link">
                    Sign In
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
