"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, GraduationCap, Lock, Search, User } from "lucide-react";
import { patchAuthed, postAuthed, fetchAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import { shouldShowCampusVerificationQaControls } from "@/lib/onboardingQa";
import { CAMPUS_EMAIL_USER_MESSAGES } from "@/lib/campusEmailVerification";
import { CampusEmailOtpInput } from "@/components/auth/CampusEmailOtpInput";
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
  shouldAskGraduationYear,
  type CommunityId,
  type InterestId,
  type StudentStatusId,
} from "@/lib/onboarding/taxonomy";
import {
  demographicProgress,
  isDemographicOnboardingStep,
  nextDemographicStep,
  previousDemographicStep,
  type DemographicOnboardingStep,
} from "@/lib/onboarding/flow";
import {
  OnboardingAmbient,
  OnboardingMagicRing,
  type OnboardingAmbientDensity,
} from "@/components/onboarding/OnboardingAmbient";

type Step = DemographicOnboardingStep;

const DRAFT_KEY = "cq_onboarding_v3_draft";

type DraftState = {
  step: Step;
  studentStatus: StudentStatusId | null;
  graduationYear: number | null;
  graduateOther: boolean;
  institutionId: "uri";
  interests: InterestId[];
  communities: CommunityId[];
};

function ambientForStep(step: Step): { density: OnboardingAmbientDensity; campusHaze: boolean } {
  if (step === "welcome") return { density: "normal", campusHaze: true };
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

function ProgressHeader({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  return (
    <div className="cq-onboard-progress-wrap">
      <p className="cq-onboard-progress-label">{label}</p>
      <div
        className="cq-onboard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={label}
      >
        {Array.from({ length: total }).map((_, i) => {
          const state = i < current - 1 ? "done" : i === current - 1 ? "active" : "todo";
          return <span key={i} className={`cq-onboard-dot cq-onboard-dot--${state}`} />;
        })}
      </div>
    </div>
  );
}

export function AuthOnboardingFlow({
  onComplete,
  onRequestSignIn,
  startAtEmailVerification = false,
}: {
  onComplete: () => void | Promise<void>;
  onRequestSignIn?: () => void;
  startAtEmailVerification?: boolean;
}) {
  const draft = readDraft();
  const claimsBootstrap = readAccessTokenClaims(getAccessToken());
  const draftStep = isDemographicOnboardingStep(draft?.step) ? draft.step : null;
  const [step, setStep] = useState<Step>(
    draftStep ??
      (startAtEmailVerification ? "email_verification" : claimsBootstrap?.sub ? "student_status" : "welcome"),
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
  const [sparkInterestId, setSparkInterestId] = useState<InterestId | null>(null);
  const [campusVerified, setCampusVerified] = useState(false);
  const [emailMasked, setEmailMasked] = useState("");
  const [hasActiveChallenge, setHasActiveChallenge] = useState(false);
  const [resendAvailableInSeconds, setResendAvailableInSeconds] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [codeVerifying, setCodeVerifying] = useState(false);
  const [qaSending, setQaSending] = useState(false);
  const submitLock = useRef(false);
  const sendLock = useRef(false);
  const verifyLock = useRef(false);
  const statusInFlight = useRef(false);
  const yearOptions = graduationYearOptions();

  const claims = readAccessTokenClaims(getAccessToken());
  const userEmail = claims?.email ?? "";
  const isQaAccount = shouldShowCampusVerificationQaControls(userEmail);
  const continueBlocked = !campusVerified;
  const resendLocked = resendAvailableInSeconds > 0 || codeSending;
  const includeWelcome = !startAtEmailVerification && !claimsBootstrap?.sub;
  const flowArgs = {
    studentStatus,
    includeWelcome,
    emailOnly: startAtEmailVerification,
  };
  const progress = demographicProgress({ current: step, ...flowArgs });

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

  useEffect(() => {
    if (resendAvailableInSeconds <= 0) return;
    const id = window.setTimeout(() => {
      setResendAvailableInSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [resendAvailableInSeconds, nowMs]);

  useEffect(() => {
    const next: Record<Step, string | null> = {
      welcome: BRAND_KNIGHT.welcoming,
      student_status: BRAND_KNIGHT.heroic,
      school: BRAND_KNIGHT.pointing,
      email_verification: BRAND_KNIGHT.heroic,
      graduation_year: BRAND_KNIGHT.pointing,
      interests: BRAND_KNIGHT.presenting,
      communities: BRAND_KNIGHT.presentingRight,
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

  async function refreshCampusVerificationStatus() {
    if (statusInFlight.current) return;
    statusInFlight.current = true;
    try {
      const status = await fetchAuthed<{
        verified: boolean;
        verifiedAt: string | null;
        emailMasked: string;
        hasActiveChallenge: boolean;
        expiresInSeconds: number;
        resendAvailableInSeconds: number;
      }>("/api/auth/email-verification/status");
      setCampusVerified(status.verified);
      setEmailMasked(status.emailMasked);
      setHasActiveChallenge(status.hasActiveChallenge);
      setResendAvailableInSeconds(status.resendAvailableInSeconds);
    } catch {
      // Keep last known status.
    } finally {
      statusInFlight.current = false;
    }
  }

  useEffect(() => {
    if (step !== "email_verification") return;
    void refreshCampusVerificationStatus();
  }, [step]);

  async function sendCampusCode() {
    if (sendLock.current || codeSending) return;
    sendLock.current = true;
    setCodeSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await postAuthed<
        {
          alreadyVerified: boolean;
          expiresInSeconds: number;
          resendAvailableInSeconds: number;
          emailMasked: string;
        },
        { requested?: boolean }
      >("/api/auth/email-verification/send", {});
      setEmailMasked(result.emailMasked);
      setResendAvailableInSeconds(result.resendAvailableInSeconds);
      if (result.alreadyVerified) {
        setCampusVerified(true);
        setNotice(CAMPUS_EMAIL_USER_MESSAGES.alreadyVerified);
      } else {
        setHasActiveChallenge(true);
        setCampusVerified(false);
        setOtpCode("");
        setNotice(CAMPUS_EMAIL_USER_MESSAGES.sent);
      }
    } catch (err) {
      // Failed sends must not start the resend cooldown.
      setResendAvailableInSeconds(0);
      setError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.sendFailed);
      void refreshCampusVerificationStatus();
    } finally {
      sendLock.current = false;
      setCodeSending(false);
    }
  }

  async function verifyCampusCode(code: string) {
    if (verifyLock.current || codeVerifying) return;
    if (!/^\d{6}$/.test(code)) return;
    verifyLock.current = true;
    setCodeVerifying(true);
    setError(null);
    try {
      const result = await postAuthed<{ verified: boolean; verifiedAt: string }, { code: string }>(
        "/api/auth/email-verification/verify",
        { code },
      );
      if (result.verified) {
        setCampusVerified(true);
        setHasActiveChallenge(false);
        setOtpCode("");
        setNotice(CAMPUS_EMAIL_USER_MESSAGES.alreadyVerified);
      }
    } catch (err) {
      setCampusVerified(false);
      setError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.incorrect);
    } finally {
      verifyLock.current = false;
      setCodeVerifying(false);
    }
  }

  async function sendQaTestVerificationEmail() {
    if (!isQaAccount || sendLock.current) return;
    sendLock.current = true;
    setQaSending(true);
    setError(null);
    setNotice(null);
    try {
      await postAuthed<{ emailSent: boolean; message: string }, { forceNew: boolean }>(
        "/api/auth/qa/verification-cycle",
        { forceNew: true },
      );
      setCampusVerified(false);
      setHasActiveChallenge(true);
      setOtpCode("");
      setNotice("Test email sent. Open the newest email and enter the 6-digit code.");
      setResendAvailableInSeconds(60);
    } catch (err) {
      setResendAvailableInSeconds(0);
      setError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.sendFailed);
    } finally {
      sendLock.current = false;
      setQaSending(false);
    }
  }

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function proceedToEmailVerification() {
    go("email_verification");
    void sendCampusCode();
  }

  function goNextFrom(current: Step) {
    const next = nextDemographicStep({ current, ...flowArgs });
    if (next) go(next);
  }

  function goBack() {
    const prev = previousDemographicStep({ current: step, ...flowArgs });
    if (prev) go(prev);
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

  async function finishAndExplore() {
    if (submitLock.current || submitting) return;
    if (continueBlocked) {
      setError("Verify your URI email before continuing.");
      go("email_verification");
      return;
    }
    if (!startAtEmailVerification && (!studentStatus || interests.length < MIN_INTERESTS)) {
      setError("Please complete your onboarding selections.");
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!startAtEmailVerification) {
        await patchAuthed("/api/me/profile", {
          classYear: graduateOther || !shouldAskGraduationYear(studentStatus) ? null : graduationYear,
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
          classYear: graduateOther || !shouldAskGraduationYear(studentStatus) ? null : graduationYear,
          discoveryFocus: ["events", "organizations", "meet_students"],
          major: "",
          onboardingVersion: ONBOARDING_VERSION,
          markOnboardingComplete: false,
        });
      }
      clearDraft();
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Your progress is kept — try again.");
    } finally {
      setSubmitting(false);
      window.setTimeout(() => {
        submitLock.current = false;
      }, 600);
    }
  }

  async function continueAfterVerifiedEmail() {
    if (!campusVerified) {
      setError("Verify your URI email before continuing.");
      return;
    }
    if (startAtEmailVerification) {
      await finishAndExplore();
      return;
    }
    goNextFrom("email_verification");
  }

  const ambient = ambientForStep(step);
  const showBack = step !== "welcome" && !(startAtEmailVerification && step === "email_verification");

  return (
    <div className="cq-onboard-shell cq-onboard-shell--light">
      <OnboardingAmbient density={ambient.density} showCampusHaze={ambient.campusHaze} />

      {showBack ? (
        <button type="button" className="cq-onboard-back" aria-label="Back" onClick={goBack}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : null}

      {progress ? (
        <ProgressHeader label={progress.label} current={progress.current} total={progress.total} />
      ) : null}

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
              Join CampusQuest
            </button>
            <p className="cq-onboard-footer-link">
              Already have an account?{" "}
              <button
                type="button"
                className="cq-onboard-text-link"
                onClick={() => {
                  clearDraft();
                  onRequestSignIn?.();
                  if (!onRequestSignIn) void onComplete();
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
            <h2 className="cq-onboard-question">Tell us about yourself</h2>
            <div className="cq-onboard-stack mt-6">
              {STUDENT_STATUS_OPTIONS.map((opt) => {
                const selected = studentStatus === opt.id;
                const faculty = opt.id === "faculty_staff";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`cq-onboard-choice cq-onboard-choice--icon ${
                      selected ? "cq-onboard-choice--primary" : ""
                    }`}
                    onClick={() => {
                      setStudentStatus(opt.id);
                      if (faculty) {
                        setGraduationYear(null);
                        setGraduateOther(true);
                      }
                      go("school");
                    }}
                  >
                    {faculty ? (
                      <User className="h-5 w-5 shrink-0" aria-hidden />
                    ) : (
                      <GraduationCap className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "school" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.pointing} size="md" ring="md" />
            <h2 className="cq-onboard-question">Your campus</h2>
            <p className="cq-onboard-support">URI is the campus currently live on CampusQuest.</p>
            <div className="cq-onboard-search" aria-hidden>
              <Search className="h-4 w-4 text-slate-400" />
              <span>More campuses coming soon</span>
            </div>
            <button
              type="button"
              className="cq-onboard-school cq-onboard-school--selected"
              onClick={() => proceedToEmailVerification()}
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
            <button
              type="button"
              className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6"
              onClick={() => proceedToEmailVerification()}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === "email_verification" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.thumbsUp} size="md" ring="lg" />
            <h2 className="cq-onboard-question">
              {campusVerified ? "URI email verified" : "Check your URI email"}
            </h2>
            <p className="cq-onboard-support">
              {campusVerified
                ? CAMPUS_EMAIL_USER_MESSAGES.alreadyVerified
                : hasActiveChallenge
                  ? `We sent a 6-digit verification code to ${emailMasked || "your URI email"}`
                  : "We'll send a 6-digit verification code to your URI email."}
            </p>

            {!campusVerified ? (
              <>
                <CampusEmailOtpInput
                  value={otpCode}
                  disabled={codeVerifying || codeSending}
                  onChange={(next) => {
                    setOtpCode(next);
                    setError(null);
                  }}
                  onComplete={(code) => void verifyCampusCode(code)}
                />
                <button
                  type="button"
                  className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50"
                  disabled={codeVerifying || otpCode.length !== 6}
                  onClick={() => void verifyCampusCode(otpCode)}
                >
                  {codeVerifying ? "Verifying…" : "Verify"}
                </button>
                <p className="cq-onboard-footer-link mt-4">
                  Didn&apos;t get it?{" "}
                  <button
                    type="button"
                    className="cq-onboard-text-link disabled:opacity-50"
                    disabled={resendLocked}
                    onClick={() => void sendCampusCode()}
                  >
                    {codeSending
                      ? "Sending…"
                      : resendAvailableInSeconds > 0
                        ? CAMPUS_EMAIL_USER_MESSAGES.cooldown(resendAvailableInSeconds)
                        : hasActiveChallenge
                          ? "Resend code"
                          : "Send code"}
                  </button>
                </p>
              </>
            ) : (
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-6 disabled:opacity-50"
                disabled={submitting}
                onClick={() => void continueAfterVerifiedEmail()}
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
            )}

            {isQaAccount ? (
              <div className="mt-6">
                <button
                  type="button"
                  className="cq-onboard-text-btn disabled:opacity-50"
                  disabled={qaSending}
                  onClick={() => void sendQaTestVerificationEmail()}
                >
                  {qaSending ? "Sending test email..." : "Send test verification email"}
                </button>
              </div>
            ) : null}

            {notice ? <p className="cq-onboard-notice mt-3">{notice}</p> : null}
            {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}

            <p className="cq-onboard-privacy mt-8">
              <Lock className="inline h-3.5 w-3.5" aria-hidden /> Your email stays private to CampusQuest account
              security.
            </p>
          </div>
        ) : null}

        {step === "graduation_year" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.heroic} size="md" ring="md" />
            <h2 className="cq-onboard-question">When do you expect to graduate?</h2>
            <p className="cq-onboard-support">
              {studentStatus === "graduate_student"
                ? "Pick the year that fits, or Not sure if you don't have one."
                : "Choose a year. Academic standing can change — this is just for personalization."}
            </p>
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
                      go("interests");
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

        {step === "interests" ? (
          <div className="cq-onboard-step">
            <KnightStage src={BRAND_KNIGHT.presenting} size="sm" ring="sm" />
            <h2 className="cq-onboard-question">What are you interested in?</h2>
            <p className="cq-onboard-support">
              Pick {MIN_INTERESTS} or more. We&apos;ll personalize your feed, events, and campus recommendations.
            </p>
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
            <p className="cq-onboard-support">
              Choose any that apply. We&apos;ll surface relevant events, posts, and opportunities.
            </p>
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
              <button
                type="button"
                className="cq-onboard-text-btn disabled:opacity-50"
                disabled={submitting}
                onClick={() => void finishAndExplore()}
              >
                Skip
              </button>
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--inline cq-onboard-btn-primary--glow disabled:opacity-50"
                disabled={submitting}
                onClick={() => void finishAndExplore()}
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
            </div>
            {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
