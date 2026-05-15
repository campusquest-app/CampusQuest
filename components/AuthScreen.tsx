"use client";

import { useCallback, useState } from "react";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { fetchMeSchoolVerification, SchoolVerificationHttpError } from "@/lib/client/dashboardApi";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/client/apiSession";
import { mustRedirectToAgreement, type LegalConsentPayload } from "@/lib/client/agreementAccess";
import { LegalConsentScreen } from "@/components/LegalConsentScreen";
import { AccountSafetyStatusScreen } from "@/components/AccountSafetyStatusScreen";
import { SchoolVerificationScreen } from "@/components/SchoolVerificationScreen";

type Mode = "signin" | "signup";
type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } };
const IS_DEV = process.env.NODE_ENV !== "production";

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-white/8 border border-white/15 text-white placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 focus:border-uri-keaney/50 focus:bg-white/10 transition-all";
const labelClass = "block text-xs font-medium text-white/70 uppercase tracking-wider mb-2";

class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message);
  }
}

function formatRequestError(error: unknown, path: string, fallback: string) {
  if (error instanceof HttpRequestError) {
    if (IS_DEV) {
      const base = `Backend request failed: ${path} returned ${error.status} ${error.statusText}.`;
      return error.message && error.message !== fallback ? `${base} ${error.message}` : base;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message && !error.message.startsWith("NETWORK_ERROR:")) {
    return error.message;
  }
  if (IS_DEV) {
    return `Backend request failed: ${path} could not be reached.`;
  }
  return fallback;
}

function getEmailDomainOnly(email: string) {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return "invalid";
  return normalized.slice(atIndex + 1);
}

function logAuthFailureDev(args: {
  endpoint: string;
  status: number;
  message: string;
  email: string;
}) {
  if (!IS_DEV) return;
  const { endpoint, status, message, email } = args;
  console.warn("[Auth failure]", {
    endpoint,
    status,
    message,
    emailDomain: getEmailDomainOnly(email),
  });
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
    throw new HttpRequestError(
      payload?.error?.message ?? "Request failed.",
      path,
      response.status,
      response.statusText || "Unknown",
    );
  }
  return payload;
}

export function AuthScreen({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [showRecoveryActions, setShowRecoveryActions] = useState(false);
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

  async function checkSafetyStatus(accessToken: string) {
    const payload = await fetchJson<{
      status?: "active" | "suspended" | "banned";
      reason?: string | null;
      suspendedUntil?: string | null;
    }>("/api/me/safety-status", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const status = payload?.data?.status as "active" | "suspended" | "banned" | undefined;
    if (status === "suspended" || status === "banned") {
      setSafetyBlock({
        status,
        reason: (payload?.data?.reason as string | null | undefined) ?? null,
        suspendedUntil: (payload?.data?.suspendedUntil as string | null | undefined) ?? null,
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
    const { verification, moderationAdminAccess } = await fetchMeSchoolVerification(accessToken);
    const campusOk =
      moderationAdminAccess ||
      (verification.status === "verified" && Boolean(verification.schoolDomain) && Boolean(verification.schoolName));
    if (!campusOk) {
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

  async function handleConsentContinue() {
    setIsConsentSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }
      await fetchJson("/api/legal/consent/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedGuidelines: true,
        }),
      });
      setNeedsConsent(false);
      const verifiedForCampus = await checkSchoolVerification(token);
      if (verifiedForCampus) onComplete();
    } catch (consentError) {
      if (consentError instanceof SchoolVerificationHttpError) {
        if (consentError.status === 401) clearAccessToken();
        setError(consentError.message);
      } else {
        setError(formatRequestError(consentError, "/api/legal/consent/accept", "Consent could not be saved."));
      }
    } finally {
      setIsConsentSubmitting(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendNotice(null);
    setShowRecoveryActions(false);
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u || !p) {
      setError("Enter your student email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) {
      setError("Use your email address to sign in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await fetchJson<{ session?: { access_token?: string } }>("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: u, password: p }),
      });
      const accessToken = payload?.data?.session?.access_token;
      if (!accessToken) {
        setError("Missing access token from login response.");
        return;
      }
      setAccessToken(accessToken);
      const canUseAccount = await checkSafetyStatus(accessToken);
      if (!canUseAccount) return;
      const canContinue = await checkConsentStatus(accessToken);
      if (!canContinue) return;
      const verifiedForCampus = await checkSchoolVerification(accessToken);
      if (verifiedForCampus) onComplete();
    } catch (signInError) {
      if (signInError instanceof SchoolVerificationHttpError) {
        if (signInError.status === 401) clearAccessToken();
        setError(signInError.message);
        return;
      }
      if (signInError instanceof HttpRequestError) {
        const rawError = String(signInError.message ?? "Sign in failed.");
        logAuthFailureDev({
          endpoint: signInError.path,
          status: signInError.status,
          message: rawError,
          email: u,
        });
        const isInvalidCredentials =
          signInError.status === 401 && rawError.toLowerCase().includes("invalid login credentials");
        const isUnconfirmed = rawError.toLowerCase().includes("email not confirmed");
        if (isInvalidCredentials) {
          setError(
            "We couldn't sign you in. Please check your email and password. If you just created your account, confirm your email first or reset your password.",
          );
          setShowRecoveryActions(true);
          return;
        }
        if (isUnconfirmed) {
          setError("Please confirm your email before signing in. Check your inbox for the confirmation link.");
          setShowRecoveryActions(true);
          return;
        }
      }
      setError(formatRequestError(signInError, "/api/auth/login", "Could not reach the backend. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendNotice(null);
    setShowRecoveryActions(false);
    const eVal = email.trim().toLowerCase();
    const p = password.trim();
    if (!eVal || !p) {
      setError("Enter your email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eVal)) {
      setError("Enter a valid email address.");
      return;
    }
    if (p.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await fetchJson<{ session?: { access_token?: string }; user?: { id?: string } }>("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: eVal, password: p }),
      });
      const accessToken = payload?.data?.session?.access_token;
      if (!accessToken) {
        const createdUserId = payload?.data?.user?.id as string | undefined;
        if (createdUserId) {
          setUsername(eVal);
          setMode("signin");
          setPassword("");
          setError("Account created. Please check your email to confirm your account, then sign in.");
          setShowRecoveryActions(true);
          return;
        }
        setError("Sign up completed, but no session is available yet. Please confirm your email and sign in.");
        setShowRecoveryActions(true);
        return;
      }
      setAccessToken(accessToken);
      const canUseAccount = await checkSafetyStatus(accessToken);
      if (!canUseAccount) return;
      const canContinue = await checkConsentStatus(accessToken);
      if (!canContinue) return;
      const verifiedForCampus = await checkSchoolVerification(accessToken);
      if (verifiedForCampus) onComplete();
    } catch (signUpError) {
      if (signUpError instanceof SchoolVerificationHttpError) {
        if (signUpError.status === 401) clearAccessToken();
        setError(signUpError.message);
        return;
      }
      setError(formatRequestError(signUpError, "/api/auth/signup", "Could not reach the backend. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    const targetEmail = username.trim().toLowerCase();
    setResendNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setResendNotice("Enter a valid email address to reset your password.");
      return;
    }
    setIsResettingPassword(true);
    try {
      await fetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      setResendNotice("Password reset email sent. Please check your inbox.");
    } catch (resetError) {
      setResendNotice(formatRequestError(resetError, "/api/auth/reset-password", "Could not reach the backend. Try again."));
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleResendConfirmation() {
    const targetEmail = (mode === "signin" ? username : email).trim().toLowerCase();
    setResendNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setResendNotice("Enter a valid email address to resend confirmation.");
      return;
    }
    setIsResendingConfirmation(true);
    try {
      await fetchJson("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      setResendNotice("Confirmation email resent. Please check your inbox.");
    } catch (resendError) {
      setResendNotice(
        formatRequestError(resendError, "/api/auth/resend-confirmation", "Could not reach the backend. Try again."),
      );
    } finally {
      setIsResendingConfirmation(false);
    }
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
          setMode("signin");
          setUsername("");
          setPassword("");
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-10 sm:py-14">
      {/* Subtle background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(104, 171, 232, 0.08) 0%, transparent 50%)",
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-full max-w-[200px] sm:max-w-[220px] h-auto mb-4">
            <img
              src="/campusquest-logo.png"
              alt="CampusQuest"
              className="w-full h-auto object-contain drop-shadow-[0_0_20px_rgba(104,171,232,0.2)]"
            />
          </div>
          <p className="text-uri-keaney/80 text-xs font-medium tracking-[0.2em] uppercase">
            URI · Level up for real
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-xl shadow-black/20 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setResendNotice(null);
                setShowRecoveryActions(false);
              }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                mode === "signin"
                  ? "text-uri-keaney bg-uri-keaney/10 border-b-2 border-uri-keaney"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setResendNotice(null);
                setShowRecoveryActions(false);
              }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                mode === "signup"
                  ? "text-uri-keaney bg-uri-keaney/10 border-b-2 border-uri-keaney"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              Sign up
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-5">
                <div>
                  <label htmlFor="auth-username" className={labelClass}>
                    Student email
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    autoComplete="username email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. you@uri.edu"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="auth-password-signin" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="auth-password-signin"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
                {error && (
                  <p className="text-xs text-amber-400/90 bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                    {error}
                  </p>
                )}
                {showRecoveryActions ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResendConfirmation()}
                      disabled={isResendingConfirmation}
                      className="w-full py-2.5 rounded-lg border border-uri-keaney/40 text-uri-keaney text-xs font-semibold hover:bg-uri-keaney/10 disabled:opacity-60"
                    >
                      {isResendingConfirmation ? "Resending..." : "Resend confirmation email"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={isResettingPassword}
                      className="w-full py-2.5 rounded-lg border border-white/25 text-white text-xs font-semibold hover:bg-white/10 disabled:opacity-60"
                    >
                      {isResettingPassword ? "Sending..." : "Reset password"}
                    </button>
                  </div>
                ) : null}
                {resendNotice ? <p className="text-xs text-white/70">{resendNotice}</p> : null}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-uri-keaney text-white font-semibold text-sm hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors shadow-lg shadow-uri-keaney/20"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <label htmlFor="auth-email" className={labelClass}>
                    Student email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@uri.edu"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="auth-password-signup" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="auth-password-signup"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputClass}
                  />
                </div>
                {error && (
                  <p className="text-xs text-amber-400/90 bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                    {error}
                  </p>
                )}
                {showRecoveryActions ? (
                  <button
                    type="button"
                    onClick={() => void handleResendConfirmation()}
                    disabled={isResendingConfirmation}
                    className="w-full py-2.5 rounded-lg border border-uri-keaney/40 text-uri-keaney text-xs font-semibold hover:bg-uri-keaney/10 disabled:opacity-60"
                  >
                    {isResendingConfirmation ? "Resending..." : "Resend confirmation email"}
                  </button>
                ) : null}
                {resendNotice ? <p className="text-xs text-white/70">{resendNotice}</p> : null}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-uri-keaney text-white font-semibold text-sm hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors shadow-lg shadow-uri-keaney/20"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          Sign in with your campus credentials to track progress and earn XP.
        </p>
      </div>
    </div>
  );
}
