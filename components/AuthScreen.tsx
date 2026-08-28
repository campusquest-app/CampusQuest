"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DEFAULT_POLICY_VERSION, LEGAL_DOC_LINKS } from "@/lib/legal/policy";
import { fetchMeSchoolVerification, SchoolVerificationHttpError } from "@/lib/client/dashboardApi";
import { canAccessCampusFromSnapshot } from "@/lib/client/campusAccess";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/client/apiSession";
import { persistSupabaseSession } from "@/lib/client/supabaseSession";
import { loadLegalConsentGate, submitLegalConsentAccept } from "@/lib/client/legalConsentClient";
import { LegalConsentScreen } from "@/components/LegalConsentScreen";
import { AccountSafetyStatusScreen } from "@/components/AccountSafetyStatusScreen";
import { SchoolVerificationScreen } from "@/components/SchoolVerificationScreen";
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
import { CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";
import { clearAuthSignupDraft, readAuthSignupDraft, writeAuthSignupDraft } from "@/lib/client/authSignupDraft";
import {
  SIGNUP_SESSION_RETRY_DELAYS_MS,
  isSignupPendingSetupCode,
  shouldAutoEstablishSignupSession,
  shouldKeepSignupPassword,
} from "@/lib/client/signupSessionContinuity";

type Mode = "welcome" | "signin" | "signup";
type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } | string };
const REMEMBER_EMAIL_KEY = "cq_auth_remember_email";
const SIGNUP_COOLDOWN_MS = 3000;
/** Bound auth API waits so Create Account / Sign In cannot spin forever. */
const AUTH_REQUEST_TIMEOUT_MS = 20_000;

type SignupLifecycleUi =
  | "idle"
  | "submitting"
  | "auth_created"
  | "verification_required"
  | "initializing"
  | "onboarding"
  | "complete"
  | "recover_sign_in"
  | "failed";

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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`REQUEST_TIMEOUT:${path}`);
    }
    throw new Error(`NETWORK_ERROR:${path}`);
  } finally {
    window.clearTimeout(timeoutId);
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
  const [signupLifecycle, setSignupLifecycle] = useState<SignupLifecycleUi>("idle");
  const [usernameAvailability, setUsernameAvailability] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = readAuthSignupDraft();
    if (draft) {
      setMode(draft.mode);
      setEmail(draft.email);
      setUsername(draft.username);
      setPassword(draft.password);
      setAcceptedTerms(draft.acceptedTerms);
    }
    const expiredNotice = sessionStorage.getItem(AUTH_SESSION_EXPIRED_NOTICE_KEY);
    if (expiredNotice) {
      sessionStorage.removeItem(AUTH_SESSION_EXPIRED_NOTICE_KEY);
      setNotice(expiredNotice);
      setMode("signin");
    }
    if (!draft?.email) {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) setEmail(saved);
    }
  }, []);

  useEffect(() => {
    if (mode !== "signup" && mode !== "signin") return;
    writeAuthSignupDraft({
      mode,
      email,
      username,
      password,
      acceptedTerms,
    });
  }, [mode, email, username, password, acceptedTerms]);

  useEffect(() => {
    if (mode !== "signup") {
      setUsernameAvailability("idle");
      return;
    }
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      setUsernameAvailability("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setUsernameAvailability("checking");
      void fetch(`/api/auth/username-available?username=${encodeURIComponent(u)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as {
            data?: { available?: boolean };
          };
          if (!response.ok) {
            setUsernameAvailability("idle");
            return;
          }
          setUsernameAvailability(payload.data?.available === false ? "taken" : "available");
        })
        .catch(() => {
          if (!controller.signal.aborted) setUsernameAvailability("idle");
        });
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mode, username]);

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

  const checkConsentStatus = useCallback(async () => {
    const result = await loadLegalConsentGate();
    if (result.kind === "unauthenticated") {
      throw new Error("Session expired. Please sign in again.");
    }
    if (result.kind === "temporary_error") {
      throw new Error(result.message);
    }
    const currentPolicyVersion = result.data.currentPolicyVersion ?? DEFAULT_POLICY_VERSION;
    setConsentVersion(currentPolicyVersion);
    if (result.kind === "required") {
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
    const canContinue = await checkConsentStatus();
    if (!canContinue) return;
    const sessionToken = getAccessToken() ?? token;
    const verifiedForCampus = await checkSchoolVerification(sessionToken);
    if (!verifiedForCampus) return;

    // Demographic onboarding is an authenticated Dashboard routing gate
    // (demographics → CharacterGate → app), not signup-only presentation.
    if (opts.isSignup) {
      void dismissOnboardingTutorialOnServer();
    }

    resetMobileViewportScale();
    setSuccessBanner(opts.isSignup ? "Welcome to CampusQuest!" : "Welcome Back!");
    window.setTimeout(() => {
      resetMobileViewportScale();
      clearAuthSignupDraft();
      onComplete();
    }, 700);
  }

  async function handleConsentContinue() {
    setIsConsentSubmitting(true);
    setError(null);
    try {
      const result = await submitLegalConsentAccept();
      if (result.kind === "unauthenticated") {
        clearAccessToken();
        throw new Error("Session expired. Please sign in again.");
      }
      if (result.kind === "temporary_error") {
        throw new Error(result.message);
      }
      if (result.kind === "required") {
        throw new Error("Your agreement is still required. Please try again.");
      }
      setNeedsConsent(false);
      const token = getAccessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");
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

  async function persistIncomingSession(session: {
    access_token?: string;
    refresh_token?: string;
  }): Promise<boolean> {
    const accessToken = session.access_token;
    if (!accessToken) return false;
    setAccessToken(accessToken);
    if (session.refresh_token) {
      await persistSupabaseSession({ access_token: accessToken, refresh_token: session.refresh_token });
    }
    syncOnboardingQaReplayFromAccessToken(accessToken);
    return true;
  }

  async function loginForSignupContinuity(eVal: string, p: string) {
    const payload = await fetchJson<{ session?: { access_token?: string; refresh_token?: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: eVal, password: p }),
      },
    );
    return payload?.data?.session ?? null;
  }

  async function establishSignupSession(eVal: string, p: string): Promise<boolean> {
    setSignupLifecycle("initializing");
    let lastError: unknown = null;
    for (const delay of SIGNUP_SESSION_RETRY_DELAYS_MS) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      try {
        const session = await loginForSignupContinuity(eVal, p);
        if (session && (await persistIncomingSession(session))) return true;
      } catch (err) {
        lastError = err;
        if (err instanceof HttpRequestError) {
          const code = (err.code ?? "").toUpperCase();
          if (code === "SIGNUP_VERIFICATION_REQUIRED" || code === "EMAIL_NOT_CONFIRMED") {
            throw err;
          }
          if (isSignupPendingSetupCode(code) || err.status === 503 || err.status === 404) {
            continue;
          }
          if (err.status === 401) return false;
        }
      }
    }
    if (lastError instanceof HttpRequestError && isSignupPendingSetupCode(lastError.code)) {
      return false;
    }
    return false;
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
    if (!eVal || !u || !p) {
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
    if (usernameAvailability === "taken") {
      setError("This username is already taken.");
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
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service, Privacy Policy, and Data & Personalization Consent to continue.");
      return;
    }

    signupLockedRef.current = true;
    lastSignupAttemptRef.current = now;
    setIsSubmitting(true);
    setSignupLifecycle("submitting");
    try {
      const payload = await fetchJson<{
        session?: { access_token?: string; refresh_token?: string };
        user?: { id?: string };
        lifecycle?: string;
      }>("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: eVal, password: p, username: u }),
      });
      const session = payload?.data?.session;
      const accessToken = session?.access_token;
      const lifecycle = payload?.data?.lifecycle;
      const needsVerification =
        lifecycle === "verification_required" || FEATURE_FLAGS.requireEmailVerification;
      if (accessToken) {
        setSignupLifecycle("auth_created");
        await persistIncomingSession(session ?? {});
        setSuccessBanner("Account Created!");
        setSignupLifecycle("onboarding");
        await completeAuthenticatedSession({ isSignup: true });
        setSignupLifecycle("complete");
        return;
      }
      if (
        shouldAutoEstablishSignupSession({
          hasAccessToken: false,
          verificationRequired: needsVerification,
        })
      ) {
        const established = await establishSignupSession(eVal, p);
        if (established) {
          setSuccessBanner("Account Created!");
          setSignupLifecycle("onboarding");
          await completeAuthenticatedSession({ isSignup: true });
          setSignupLifecycle("complete");
          return;
        }
      }
      setSignupLifecycle(needsVerification ? "verification_required" : "recover_sign_in");
      setMode("signin");
      setEmail(eVal);
      if (!shouldKeepSignupPassword({ verificationRequired: needsVerification })) {
        setPassword("");
      }
      setSuccessBanner("Account Created!");
      setNotice(
        needsVerification
          ? "Check your URI email to confirm your account before signing in."
          : "Your account is ready. Sign in to continue onboarding.",
      );
    } catch (signUpError) {
      logAuthClientError("signup", signUpError);
      if (signUpError instanceof SchoolVerificationHttpError) {
        if (signUpError.status === 401) clearAccessToken();
        setSignupLifecycle("failed");
        setError(signUpError.message);
        return;
      }
      const mapped = mapSignupError(signUpError);
      if ("passwordRequirements" in mapped) {
        setSignupLifecycle("failed");
        setShowPasswordRequirementsError(true);
        setError(null);
        return;
      }
      setShowPasswordRequirementsError(false);
      const errorCode =
        signUpError instanceof HttpRequestError ? signUpError.code ?? null : null;
      if (
        mapped.recoverSignIn &&
        shouldAutoEstablishSignupSession({
          hasAccessToken: false,
          verificationRequired: mapped.verificationRequired === true,
          recoverSignIn: true,
          errorCode,
        })
      ) {
        try {
          const established = await establishSignupSession(eVal, p);
          if (established) {
            setSuccessBanner("Account Created!");
            setSignupLifecycle("onboarding");
            await completeAuthenticatedSession({ isSignup: true });
            setSignupLifecycle("complete");
            return;
          }
        } catch (retryError) {
          logAuthClientError("signup-retry", retryError);
        }
      }
      if (mapped.recoverSignIn) {
        setSignupLifecycle(mapped.verificationRequired ? "verification_required" : "recover_sign_in");
        setMode("signin");
        setEmail(eVal);
        if (!shouldKeepSignupPassword({ verificationRequired: mapped.verificationRequired === true, errorCode })) {
          setPassword("");
        }
        setError(null);
        setNotice(mapped.message);
        return;
      }
      setSignupLifecycle("failed");
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
              src={CAMPUSQUEST_LOGO_SRC}
              alt="CampusQuest"
              className="cq-onboard-logo"
              width={88}
              height={88}
              decoding="async"
            />
            <div className="cq-onboard-knight" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BRAND_KNIGHT.thumbsUp}
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
              Join CampusQuest
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
      {isSubmitting ||
      signupLifecycle === "initializing" ||
      signupLifecycle === "auth_created" ||
      signupLifecycle === "onboarding" ? (
        <div className="cq-auth-provisioning" role="status" aria-live="polite">
          <p className="cq-auth-provisioning__title">Setting up CampusQuest</p>
          <p className="cq-auth-provisioning__copy">Finishing your account. This only takes a moment.</p>
        </div>
      ) : null}
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
                <form
                  onSubmit={handleSignUp}
                  className="space-y-4"
                  data-signup-lifecycle={signupLifecycle}
                >
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
                      aria-invalid={usernameAvailability === "taken"}
                    />
                    {usernameAvailability === "checking" ? (
                      <p className="cq-auth-notice mt-1">Checking username…</p>
                    ) : null}
                    {usernameAvailability === "taken" ? (
                      <p className="cq-auth-error mt-1">This username is already taken.</p>
                    ) : null}
                    {usernameAvailability === "available" ? (
                      <p className="cq-auth-success mt-1">Username is available.</p>
                    ) : null}
                  </div>
                  <div className="cq-auth-terms">
                    <input
                      id="auth-signup-agreement"
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      aria-required="true"
                      aria-labelledby="auth-signup-agreement-copy"
                    />
                    <span id="auth-signup-agreement-copy">
                      <label htmlFor="auth-signup-agreement">I agree to the </label>
                      <Link href={LEGAL_DOC_LINKS.terms} className="cq-auth-link">
                        Terms of Service
                      </Link>
                      {", "}
                      <Link href={LEGAL_DOC_LINKS.privacy} className="cq-auth-link">
                        Privacy Policy
                      </Link>
                      {", and "}
                      <Link href={LEGAL_DOC_LINKS.dataConsent} className="cq-auth-link">
                        Data & Personalization Consent
                      </Link>
                      .
                    </span>
                  </div>
                  {showPasswordRequirementsError ? <AuthPasswordRequirementsAlert /> : null}
                  {error ? <p className="cq-auth-error">{error}</p> : null}
                  {successBanner ? <p className="cq-auth-success">{successBanner}</p> : null}
                  {notice ? <p className="cq-auth-notice">{notice}</p> : null}
                  <button type="submit" disabled={isSubmitting || usernameAvailability === "taken"} className="cq-auth-btn-primary w-full">
                    {isSubmitting ||
                    signupLifecycle === "initializing" ||
                    signupLifecycle === "auth_created" ||
                    signupLifecycle === "onboarding"
                      ? "Finishing account…"
                      : "Create Account"}
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
