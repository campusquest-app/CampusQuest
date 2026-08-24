"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, GraduationCap, Lock, Mail, Search, User } from "lucide-react";
import { patchAuthed, postAuthed, fetchAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken, setAccessToken } from "@/lib/client/apiSession";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import {
  remainingResendCooldownMs,
  readResendCooldownState,
  writeResendCooldownState,
  startResendCooldown,
  formatResendCooldownLabel,
} from "@/lib/client/authResendCooldown";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { isOnboardingQaEmail } from "@/lib/onboardingQa";
import {
  clearVerificationQaCycleRecord,
  rememberVerificationQaCycle,
  resolveContinueBlockedForVerification,
  resolveEmailVerifiedForOnboardingUi,
} from "@/lib/client/verificationQaCycle";
import {
  resolveVerificationStatusLabel,
  VERIFICATION_QA_UI_COPY,
  type VerificationQaTestUiState,
} from "@/lib/verificationQaCycle";
import { supabaseClient } from "@/lib/supabase/client";
import { graduationYearOptions } from "@/lib/onboarding/graduationYear";
import {
  BRAND_KNIGHT,
  BRAND_LOGO_OFFICIAL,
  COMMUNITY_OPTIONS,
  INSTITUTIONS,
  INTEREST_OPTIONS,
  MIN_INTERESTS,
  ONBOARDING_VERSION,
  STUDENT_STATUS_OPTIONS,
  type CommunityId,
  type InterestId,
  type StudentStatusId,
} from "@/lib/onboarding/taxonomy";
import {
  OnboardingAmbient,
  OnboardingMagicRing,
  type OnboardingAmbientDensity,
} from "@/components/onboarding/OnboardingAmbient";

type Step =
  | "welcome"
  | "student_status"
  | "graduation_year"
  | "school"
  | "interests"
  | "communities"
  | "email_verification"
  | "success";

const STEPS: Step[] = [
  "welcome",
  "student_status",
  "graduation_year",
  "school",
  "interests",
  "communities",
  "email_verification",
  "success",
];

const DRAFT_KEY = "cq_onboarding_v2_draft";

type DraftState = {
  step: Step;
  studentStatus: StudentStatusId | null;
  graduationYear: number | null;
  graduateOther: boolean;
  institutionId: "uri";
  interests: InterestId[];
  communities: CommunityId[];
};

function progressIndex(step: Step): number {
  // Dots 1–5 for screens 2–6 (student_status … communities); email keeps last dot
  const map: Record<Step, number> = {
    welcome: -1,
    student_status: 0,
    graduation_year: 1,
    school: 2,
    interests: 3,
    communities: 4,
    email_verification: 4,
    success: -1,
  };
  return map[step];
}

function ambientForStep(step: Step): { density: OnboardingAmbientDensity; campusHaze: boolean } {
  if (step === "welcome") return { density: "normal", campusHaze: true };
  if (step === "success") return { density: "celebrate", campusHaze: false };
  if (step === "email_verification") return { density: "calm", campusHaze: false };
  return { density: "normal", campusHaze: false };
}

function readDraft(): Partial<DraftState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<DraftState>;
  } catch {
    return null;
  }
}

function writeDraft(draft: DraftState) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function KnightStage({
  src,
  size = "md",
  ring = "md",
}: {
  src: string;
  size?: "sm" | "md" | "lg";
  ring?: "sm" | "md" | "lg" | "none";
}) {
  return (
    <div className={`cq-onboard-knight-stage cq-onboard-knight-stage--${size}`} aria-hidden="true">
      {ring !== "none" ? <OnboardingMagicRing size={ring === "lg" ? "lg" : ring === "sm" ? "sm" : "md"} /> : null}
      <div className="cq-onboard-knight">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="cq-onboard-knight-img" width={240} height={240} decoding="async" />
      </div>
    </div>
  );
}

function ProgressDots({ active }: { active: number }) {
  if (active < 0) return null;
  return (
    <div
      className="cq-onboard-progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={active + 1}
      aria-label="Onboarding progress"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const state = i < active ? "done" : i === active ? "active" : "todo";
        return <span key={i} className={`cq-onboard-dot cq-onboard-dot--${state}`} />;
      })}
    </div>
  );
}

export function AuthOnboardingFlow({
  onComplete,
  onRequestSignIn,
}: {
  onComplete: () => void;
  onRequestSignIn?: () => void;
}) {
  const draft = readDraft();
  const claimsBootstrap = readAccessTokenClaims(getAccessToken());
  const [step, setStep] = useState<Step>(
    (draft?.step as Step) ?? (claimsBootstrap?.sub ? "student_status" : "welcome"),
  );
  const [studentStatus, setStudentStatus] = useState<StudentStatusId | null>(draft?.studentStatus ?? null);
  const [graduationYear, setGraduationYear] = useState<number | null>(draft?.graduationYear ?? null);
  const [graduateOther, setGraduateOther] = useState(Boolean(draft?.graduateOther));
  const [institutionId] = useState<"uri">("uri");
  const [interests, setInterests] = useState<InterestId[]>(draft?.interests ?? []);
  const [communities, setCommunities] = useState<CommunityId[]>(draft?.communities ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isResending, setIsResending] = useState(false);
  const [sparkInterestId, setSparkInterestId] = useState<InterestId | null>(null);
  const [qaCyclePending, setQaCyclePending] = useState(false);
  const [qaAuthoritativeConfirmed, setQaAuthoritativeConfirmed] = useState<boolean | null>(null);
  /** Sticky: once Auth reports verified for the QA account, keep onboarding status/Continue stable during delivery tests. */
  const [qaAccountAlreadyVerified, setQaAccountAlreadyVerified] = useState(false);
  const [qaTestUiState, setQaTestUiState] = useState<VerificationQaTestUiState>("idle");
  const [qaTestNotice, setQaTestNotice] = useState<string | null>(null);
  const submitLock = useRef(false);
  const qaStatusInFlight = useRef(false);
  const qaSendLock = useRef(false);
  const yearOptions = graduationYearOptions();

  const claims = readAccessTokenClaims(getAccessToken());
  const userEmail = claims?.email ?? "";
  const userId = claims?.sub ?? null;
  const isQaAccount = isOnboardingQaEmail(userEmail);
  const claimConfirmed = claims?.emailConfirmed === true;
  const emailConfirmedAuthoritative =
    isQaAccount && qaAuthoritativeConfirmed !== null ? qaAuthoritativeConfirmed : claimConfirmed;
  const emailConfirmedForUi = resolveEmailVerifiedForOnboardingUi({
    email: userEmail,
    emailConfirmedAuthoritative: isQaAccount && qaAccountAlreadyVerified ? true : emailConfirmedAuthoritative,
    requireEmailVerification: FEATURE_FLAGS.requireEmailVerification,
    hasSession: Boolean(claims?.sub),
  });
  const continueBlocked = resolveContinueBlockedForVerification({
    emailConfirmedAuthoritative: isQaAccount && qaAccountAlreadyVerified ? true : emailConfirmedAuthoritative,
    requireEmailVerification: FEATURE_FLAGS.requireEmailVerification,
  });
  const verificationStatus = resolveVerificationStatusLabel({
    isQaAccount,
    qaAccountAlreadyVerified,
    emailConfirmedForUi,
  });
  const qaSending = qaTestUiState === "sending";

  useEffect(() => {
    writeDraft({
      step,
      studentStatus,
      graduationYear,
      graduateOther,
      institutionId,
      interests,
      communities,
    });
  }, [step, studentStatus, graduationYear, graduateOther, institutionId, interests, communities]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Preload next knight assets (official paths only)
  useEffect(() => {
    const next: Record<Step, string | null> = {
      welcome: BRAND_KNIGHT.welcoming,
      student_status: BRAND_KNIGHT.heroic,
      graduation_year: BRAND_KNIGHT.pointing,
      school: BRAND_KNIGHT.presenting,
      interests: BRAND_KNIGHT.presentingRight,
      communities: BRAND_KNIGHT.thumbsUp,
      email_verification: BRAND_KNIGHT.heroic,
      success: null,
    };
    const src = next[step];
    if (!src) return;
    const img = new Image();
    img.src = src;
  }, [step]);

  useEffect(() => {
    if (!sparkInterestId) return;
    const t = window.setTimeout(() => setSparkInterestId(null), 420);
    return () => window.clearTimeout(t);
  }, [sparkInterestId]);

  async function refreshAuthoritativeVerificationStatus() {
    if (!isQaAccount || qaStatusInFlight.current) return;
    qaStatusInFlight.current = true;
    try {
      const view = await fetchAuthed<{
        emailConfirmed: boolean;
        cyclePending: boolean;
        cycle: { cycleId: string } | null;
      }>("/api/auth/qa/verification-cycle");
      setQaAuthoritativeConfirmed(view.emailConfirmed);
      setQaCyclePending(view.cyclePending);
      if (view.emailConfirmed) {
        setQaAccountAlreadyVerified(true);
      }
      if (view.cyclePending && view.cycle?.cycleId && userId) {
        rememberVerificationQaCycle(userId, view.cycle.cycleId);
      }
      if (!view.cyclePending && view.emailConfirmed) {
        clearVerificationQaCycleRecord();
      }
      const { data } = await supabaseClient.auth.refreshSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
      }
    } catch {
      // Non-QA or transient — keep claim-based fallback.
    } finally {
      qaStatusInFlight.current = false;
    }
  }

  // Seed QA verified baseline from JWT before the status GET returns.
  useEffect(() => {
    if (!isQaAccount) return;
    if (claimConfirmed) setQaAccountAlreadyVerified(true);
  }, [isQaAccount, claimConfirmed]);

  // Load QA cycle status on the verification step only (GET — never auto-starts / re-sends).
  useEffect(() => {
    if (step !== "email_verification" || !isQaAccount) return;
    void refreshAuthoritativeVerificationStatus();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAuthoritativeVerificationStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => {
      if (qaCyclePending) void refreshAuthoritativeVerificationStatus();
    }, 4000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional step/account gate
  }, [step, isQaAccount, qaCyclePending, userId]);

  async function sendQaTestVerificationEmail() {
    if (!isQaAccount || !userId || qaSendLock.current) return;
    qaSendLock.current = true;
    setQaTestUiState("sending");
    setError(null);
    setQaTestNotice(null);
    setNotice(null);
    try {
      const result = await postAuthed<
        {
          cycleId: string;
          emailSent: boolean;
          alreadySent: boolean;
          message: string;
        },
        { forceNew: boolean }
      >("/api/auth/qa/verification-cycle", { forceNew: true });
      rememberVerificationQaCycle(userId, result.cycleId);
      setQaCyclePending(true);
      // Keep onboarding status/Continue on the verified baseline — delivery test is separate.
      setQaTestUiState("sent");
      setQaTestNotice(VERIFICATION_QA_UI_COPY.sentSuccess);
      const { data } = await supabaseClient.auth.refreshSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
      }
    } catch (err) {
      setQaTestUiState("failed");
      setError(err instanceof Error ? err.message : VERIFICATION_QA_UI_COPY.sendFailedFallback);
    } finally {
      qaSendLock.current = false;
      setQaTestUiState((prev) => (prev === "sending" ? "idle" : prev));
    }
  }

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function toggleInterest(id: InterestId) {
    setInterests((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 15) return prev;
      setSparkInterestId(id);
      return [...prev, id];
    });
  }

  function toggleCommunity(id: CommunityId) {
    setCommunities((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function sendVerificationEmail() {
    if (!userEmail || isResending) return;
    const remaining = remainingResendCooldownMs({ email: userEmail, nowMs, stored: readResendCooldownState() });
    if (remaining > 0) {
      setNotice(`Please wait ${formatResendCooldownLabel(remaining)} before resending.`);
      return;
    }
    setIsResending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string }; data?: unknown } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Could not send verification email.");
      }
      writeResendCooldownState(startResendCooldown({ email: userEmail, nowMs: Date.now() }));
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification email.");
    } finally {
      setIsResending(false);
    }
  }

  async function finishAndExplore() {
    if (submitLock.current || submitting) return;
    if (!studentStatus || interests.length < MIN_INTERESTS) {
      setError("Please complete your onboarding selections.");
      return;
    }
    if (continueBlocked) {
      setError("Verify your URI email before continuing.");
      go("email_verification");
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await patchAuthed("/api/me/profile", {
        classYear: graduateOther ? null : graduationYear,
        studentStatus,
        institutionId,
        onboardingVersion: ONBOARDING_VERSION,
      });
      await postAuthed("/api/me/onboarding-preferences", {
        schoolName: INSTITUTIONS.uri.schoolName,
        interests,
        communities,
        institutionId,
        studentStatus,
        classYear: graduateOther ? null : graduationYear,
        discoveryFocus: ["events", "organizations", "meet_students"],
        major: "",
        onboardingVersion: ONBOARDING_VERSION,
        markOnboardingComplete: false,
      });
      clearDraft();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Your progress is kept — try again.");
    } finally {
      setSubmitting(false);
      window.setTimeout(() => {
        submitLock.current = false;
      }, 600);
    }
  }

  const resendRemaining = remainingResendCooldownMs({
    email: userEmail,
    nowMs,
    stored: readResendCooldownState(),
  });

  const ambient = ambientForStep(step);
  const showBack = step !== "welcome" && step !== "success";

  return (
    <div className="cq-onboard-shell cq-onboard-shell--light">
      <OnboardingAmbient density={ambient.density} showCampusHaze={ambient.campusHaze} />

      {showBack ? (
        <button
          type="button"
          className="cq-onboard-back"
          aria-label="Back"
          onClick={() => {
            const idx = STEPS.indexOf(step);
            if (idx > 0) go(STEPS[idx - 1]!);
          }}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : null}

      <ProgressDots active={progressIndex(step)} />

      <div className="cq-onboard-inner">
        {step === "welcome" ? (
          <div className="cq-onboard-hero text-center">
            <div className="cq-onboard-logo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BRAND_LOGO_OFFICIAL}
                alt="CampusQuest"
                className="cq-onboard-logo"
                width={88}
                height={88}
                decoding="async"
              />
            </div>
            <KnightStage src={BRAND_KNIGHT.thumbsUp} size="lg" ring="lg" />
            <h1 className="cq-onboard-title">
              Welcome to <span className="cq-onboard-title-accent">CampusQuest</span>
            </h1>
            <p className="cq-onboard-sub">
              Your campus. Your community.
              <br />
              Your quest.
            </p>
            <button
              type="button"
              className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-8"
              onClick={() => go("student_status")}
            >
              Let&apos;s Get Started
            </button>
            <p className="cq-onboard-footer-link">
              Already have an account?{" "}
              <button
                type="button"
                className="cq-onboard-text-link"
                onClick={() => {
                  clearDraft();
                  onRequestSignIn?.();
                  if (!onRequestSignIn) onComplete();
                }}
              >
                Sign in
              </button>
            </p>
          </div>
        ) : null}

        {step === "student_status" ? (
          <div className="cq-onboard-step">
            <div className="cq-onboard-knight-with-bubble">
              <KnightStage src={BRAND_KNIGHT.welcoming} size="lg" ring="lg" />
              <p className="cq-onboard-speech" aria-hidden="true">
                Let&apos;s begin your quest.
              </p>
            </div>
            <h2 className="cq-onboard-question">Are you a current or incoming college student?</h2>
            <div className="cq-onboard-stack mt-6">
              {STUDENT_STATUS_OPTIONS.map((opt) => {
                const isYes = opt.id === "current_or_incoming";
                const selected = studentStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`cq-onboard-choice cq-onboard-choice--icon ${
                      selected ? "cq-onboard-choice--primary" : isYes ? "cq-onboard-choice--emphasized" : ""
                    }`}
                    onClick={() => {
                      setStudentStatus(opt.id);
                      go("graduation_year");
                    }}
                  >
                    {isYes ? (
                      <GraduationCap className="h-5 w-5 shrink-0" aria-hidden />
                    ) : (
                      <User className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "graduation_year" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.heroic} size="md" ring="md" />
            <h2 className="cq-onboard-question">When do you graduate?</h2>
            <p className="cq-onboard-support">This helps us personalize your experience.</p>
            <div className="cq-onboard-stack mt-5">
              {yearOptions.map((opt) => {
                const selected =
                  opt.year == null ? graduateOther : !graduateOther && graduationYear === opt.year;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`cq-onboard-choice cq-onboard-choice--row ${selected ? "cq-onboard-choice--selected" : ""}`}
                    onClick={() => {
                      if (opt.year == null) {
                        setGraduateOther(true);
                        setGraduationYear(null);
                      } else {
                        setGraduateOther(false);
                        setGraduationYear(opt.year);
                      }
                      go("school");
                    }}
                  >
                    <span>{opt.label}</span>
                    {selected ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "school" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.pointing} size="md" ring="md" />
            <h2 className="cq-onboard-question">What school do you go to?</h2>
            <div className="cq-onboard-search" aria-hidden>
              <Search className="h-4 w-4 text-slate-400" />
              <span>Search for your school.</span>
            </div>
            <button
              type="button"
              className="cq-onboard-school cq-onboard-school--selected"
              onClick={() => go("interests")}
            >
              <span className="cq-onboard-school-mark" aria-hidden>
                R
              </span>
              <span className="text-left">
                <span className="block font-semibold text-slate-900">{INSTITUTIONS.uri.name}</span>
                <span className="block text-sm text-slate-500">{INSTITUTIONS.uri.city}</span>
              </span>
              <Check className="ml-auto h-5 w-5 shrink-0 text-white" aria-hidden />
            </button>
            <p className="cq-onboard-muted-link mt-4">Can&apos;t find your school?</p>
          </div>
        ) : null}

        {step === "interests" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.presenting} size="sm" ring="sm" />
            <h2 className="cq-onboard-question">What are you interested in?</h2>
            <p className="cq-onboard-support">Pick at least {MIN_INTERESTS} to personalize your feed.</p>
            <div className="cq-onboard-chip-grid" role="group" aria-label="Interests">
              {INTEREST_OPTIONS.map((opt) => {
                const selected = interests.includes(opt.id);
                const spark = sparkInterestId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    className={`cq-onboard-chip ${selected ? "cq-onboard-chip--selected" : ""} ${
                      spark ? "cq-onboard-chip--spark" : ""
                    }`}
                    onClick={() => toggleInterest(opt.id)}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={interests.length < MIN_INTERESTS}
              className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-40"
              onClick={() => go("communities")}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === "communities" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.presentingRight} size="sm" ring="sm" />
            <h2 className="cq-onboard-question">Find your communities.</h2>
            <p className="cq-onboard-support">Choose any that apply to you.</p>
            <div className="cq-onboard-community-grid" role="group" aria-label="Communities">
              {COMMUNITY_OPTIONS.map((opt) => {
                const selected = communities.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    className={`cq-onboard-community ${selected ? "cq-onboard-community--selected" : ""}`}
                    onClick={() => toggleCommunity(opt.id)}
                  >
                    <span>{opt.label}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            <div className="cq-onboard-row-actions mt-6">
              <button type="button" className="cq-onboard-text-btn" onClick={() => go("email_verification")}>
                Skip
              </button>
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--inline cq-onboard-btn-primary--glow"
                onClick={() => go("email_verification")}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === "email_verification" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.thumbsUp} size="md" ring="lg" />
            <h2 className="cq-onboard-question">One more step!</h2>
            <p className="cq-onboard-support">
              Verify your URI email to unlock your full CampusQuest experience.
            </p>
            <label className="cq-onboard-field-label" htmlFor="cq-onboard-email">
              Email
            </label>
            <div className="cq-onboard-input-wrap">
              <Mail className="h-4 w-4 text-slate-400" aria-hidden />
              <input
                id="cq-onboard-email"
                className="cq-onboard-input"
                value={userEmail || "you@uri.edu"}
                readOnly
                aria-readonly="true"
              />
            </div>

            <p
              className={
                verificationStatus.kind === "needs_verification"
                  ? "cq-onboard-notice mt-3"
                  : "cq-onboard-success-note mt-3"
              }
              role="status"
            >
              {verificationStatus.label}
            </p>

            {/* Primary action: Continue when verified / allowed */}
            <button
              type="button"
              className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50"
              disabled={continueBlocked}
              onClick={() => go("success")}
            >
              Continue
            </button>

            {/* Normal users who still need verification — never QA controls */}
            {!isQaAccount && !emailConfirmedForUi ? (
              <button
                type="button"
                className="cq-onboard-btn-primary mt-4 disabled:opacity-50"
                disabled={isResending || resendRemaining > 0 || !userEmail}
                onClick={() => void sendVerificationEmail()}
              >
                {isResending
                  ? "Sending…"
                  : resendRemaining > 0
                    ? formatResendCooldownLabel(resendRemaining)
                    : "Send Verification Email"}
              </button>
            ) : null}

            {/* Allowlisted QA only: secondary delivery test, separate from verification status */}
            {isQaAccount && qaAccountAlreadyVerified ? (
              <div className="mt-6">
                <button
                  type="button"
                  className="cq-onboard-text-btn disabled:opacity-50"
                  disabled={qaSending}
                  onClick={() => void sendQaTestVerificationEmail()}
                >
                  {qaSending ? VERIFICATION_QA_UI_COPY.sending : VERIFICATION_QA_UI_COPY.sendTestButton}
                </button>
                {qaTestNotice ? (
                  <p className="cq-onboard-notice mt-3" role="status">
                    {qaTestNotice}
                  </p>
                ) : null}
              </div>
            ) : null}

            {notice && !isQaAccount ? <p className="cq-onboard-notice mt-3">{notice}</p> : null}
            {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}

            <p className="cq-onboard-privacy mt-8">
              <Lock className="inline h-3.5 w-3.5" aria-hidden /> Your email stays private to CampusQuest account
              security.
            </p>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="cq-onboard-hero text-center">
            <div className="cq-onboard-logo-wrap cq-onboard-logo-wrap--celebrate">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BRAND_LOGO_OFFICIAL}
                alt="CampusQuest"
                className="cq-onboard-logo"
                width={88}
                height={88}
                decoding="async"
              />
            </div>
            <KnightStage src={BRAND_KNIGHT.heroic} size="lg" ring="lg" />
            <h1 className="cq-onboard-title cq-onboard-title--celebrate">Preferences saved!</h1>
            <p className="cq-onboard-sub cq-onboard-sub--strong">Your CampusQuest is taking shape.</p>
            <p className="cq-onboard-sub mt-2">
              Next: create your character.
              <br />
              Then explore campus, connect, and level up.
            </p>
            {error ? <p className="cq-onboard-error mt-4">{error}</p> : null}
            <button
              type="button"
              className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-8 disabled:opacity-60"
              disabled={submitting}
              onClick={() => void finishAndExplore()}
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
