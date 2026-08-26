"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, GraduationCap, Lock, Search, User } from "lucide-react";
import { patchAuthed, postAuthed, fetchAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import { shouldShowCampusVerificationQaControls } from "@/lib/onboardingQa";
import { CAMPUS_EMAIL_USER_MESSAGES, isCampusEmailVerified } from "@/lib/campusEmailVerification";
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
  isKnownStudentStatus,
  normalizeCommunityIds,
  normalizeInterestIds,
  shouldAskGraduationYear,
  type CommunityId,
  type InterestId,
  type StudentStatusId,
} from "@/lib/onboarding/taxonomy";
import {
  demographicProgress,
  previousDemographicStep,
  resolveDemographicResumeStep,
  type DemographicOnboardingStep,
} from "@/lib/onboarding/flow";
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  sanitizeDraftStep,
  sanitizeDraftStudentStatus,
  writeOnboardingDraft,
} from "@/lib/onboarding/draftStorage";
import type { DemographicPreferencesSnapshot, DemographicProfileSnapshot } from "@/lib/onboarding/demographicOnboardingPolicy";
import {
  OnboardingAmbient,
  type OnboardingAmbientDensity,
} from "@/components/onboarding/OnboardingAmbient";
import { KnightStage, OnboardingProgressHeader } from "@/components/onboarding/KnightStage";

type Step = DemographicOnboardingStep;

function ambientForStep(step: Step): { density: OnboardingAmbientDensity; campusHaze: boolean } {
  if (step === "welcome") return { density: "normal", campusHaze: true };
  if (step === "success") return { density: "celebrate", campusHaze: false };
  if (step === "email_verification") return { density: "calm", campusHaze: false };
  return { density: "normal", campusHaze: false };
}

function isDomainMessage(message: string): boolean {
  return message === CAMPUS_EMAIL_USER_MESSAGES.domain;
}

export function AuthOnboardingFlow({
  onComplete,
  onRequestSignIn,
  startAtEmailVerification = false,
  forceFullReplay = false,
  initialProfile = null,
  initialPreferences = null,
}: {
  onComplete: () => void | Promise<void>;
  onRequestSignIn?: () => void;
  startAtEmailVerification?: boolean;
  forceFullReplay?: boolean;
  initialProfile?: DemographicProfileSnapshot | null;
  initialPreferences?: DemographicPreferencesSnapshot | null;
}) {
  const claimsBootstrap = readAccessTokenClaims(getAccessToken());
  const userId = claimsBootstrap?.sub ?? null;
  const draft = readOnboardingDraft(userId);
  const draftStep = sanitizeDraftStep(draft?.step);
  const initialStudentStatus =
    sanitizeDraftStudentStatus(draft?.studentStatus) ??
    (isKnownStudentStatus(initialProfile?.student_status) ? initialProfile.student_status : null);
  const initialInterests =
    draft?.interests && draft.interests.length > 0
      ? draft.interests
      : normalizeInterestIds(initialPreferences?.interests ?? []);
  const initialCommunities =
    draft?.communities && draft.communities.length > 0
      ? draft.communities
      : normalizeCommunityIds(initialPreferences?.communities ?? []);
  const initialYear = draft?.graduationYear ?? initialProfile?.class_year ?? null;
  const initialGraduateOther =
    Boolean(draft?.graduateOther) ||
    (initialYear == null &&
      Boolean(initialProfile?.institution_id) &&
      shouldAskGraduationYear(initialStudentStatus));

  const [step, setStep] = useState<Step>(() =>
    resolveDemographicResumeStep({
      profile: initialProfile,
      preferences: initialPreferences,
      draft: {
        step: draftStep,
        studentStatus: initialStudentStatus,
        graduationYear: initialYear,
        graduateOther: initialGraduateOther,
        interests: initialInterests,
        communities: initialCommunities,
      },
      startAtEmailVerification,
      forceFullReplay,
    }),
  );
  const [studentStatus, setStudentStatus] = useState<StudentStatusId | null>(initialStudentStatus);
  const [graduationYear, setGraduationYear] = useState<number | null>(initialYear);
  const [graduateOther, setGraduateOther] = useState(initialGraduateOther);
  const [institutionId] = useState<"uri">("uri");
  const [interests, setInterests] = useState<InterestId[]>(initialInterests);
  const [communities, setCommunities] = useState<CommunityId[]>(initialCommunities);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sparkInterestId, setSparkInterestId] = useState<InterestId | null>(null);
  const [campusVerified, setCampusVerified] = useState(() => isCampusEmailVerified(initialProfile ?? {}));
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
  const includeWelcome = !startAtEmailVerification;
  const flowArgs = {
    studentStatus,
    includeWelcome,
    includeSuccess: true,
    emailOnly: startAtEmailVerification,
  };
  const progress = demographicProgress({ current: step, studentStatus, includeWelcome: false, emailOnly: false });

  useEffect(() => {
    writeOnboardingDraft(
      {
        userId,
        step,
        studentStatus,
        graduationYear,
        graduateOther,
        institutionId,
        interests,
        communities,
      },
      userId,
    );
  }, [step, studentStatus, graduationYear, graduateOther, institutionId, interests, communities, userId]);

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
      graduation_year: BRAND_KNIGHT.pointing,
      school: BRAND_KNIGHT.presenting,
      interests: BRAND_KNIGHT.presentingRight,
      communities: BRAND_KNIGHT.thumbsUp,
      email_verification: BRAND_KNIGHT.heroic,
      success: BRAND_KNIGHT.heroic,
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

  function setActionError(message: string) {
    if (isDomainMessage(message)) {
      setError(null);
      return;
    }
    setError(message);
  }

  async function persistProfilePatch(patch: {
    studentStatus?: StudentStatusId | null;
    classYear?: number | null;
    institutionId?: "uri";
  }) {
    if (forceFullReplay || startAtEmailVerification) return;
    try {
      await patchAuthed("/api/me/profile", {
        ...patch,
        onboardingVersion: ONBOARDING_VERSION,
      });
    } catch {
      /* Draft remains the local source until the user retries save. */
    }
  }

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
      setResendAvailableInSeconds(0);
      setActionError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.sendFailed);
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
      setActionError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.incorrect);
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
      setActionError(err instanceof Error ? err.message : CAMPUS_EMAIL_USER_MESSAGES.sendFailed);
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

  async function saveDemographics() {
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

  async function continueFromCommunities() {
    if (submitLock.current || submitting) return;
    if (!studentStatus || interests.length < MIN_INTERESTS) {
      setError("Please complete your onboarding selections.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!forceFullReplay) {
        await saveDemographics();
      }
      proceedToEmailVerification();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Your progress is kept — try again.");
    } finally {
      setSubmitting(false);
      window.setTimeout(() => {
        submitLock.current = false;
      }, 600);
    }
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
        await saveDemographics();
      }
      clearOnboardingDraft(userId);
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
    go("success");
  }

  const ambient = ambientForStep(step);
  const showBack =
    step !== "welcome" && step !== "success" && !(startAtEmailVerification && step === "email_verification");

  return (
    <div className="cq-onboard-shell cq-onboard-shell--light">
      <OnboardingAmbient density={ambient.density} showCampusHaze={ambient.campusHaze} />

      {showBack ? (
        <button type="button" className="cq-onboard-back" aria-label="Back" onClick={goBack}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : null}

      {progress ? (
        <OnboardingProgressHeader label={progress.label} current={progress.current} total={progress.total} />
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
                  clearOnboardingDraft(userId);
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
                        void persistProfilePatch({ studentStatus: opt.id, classYear: null });
                        go("school");
                      } else {
                        void persistProfilePatch({ studentStatus: opt.id });
                        go("graduation_year");
                      }
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
                        void persistProfilePatch({ classYear: null });
                      } else {
                        setGraduateOther(false);
                        setGraduationYear(opt.year);
                        void persistProfilePatch({ classYear: opt.year });
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
            <p className="cq-onboard-support">URI is the campus currently live on CampusQuest.</p>
            <div className="cq-onboard-search" aria-hidden>
              <Search className="h-4 w-4 text-slate-400" />
              <span>Search for your school.</span>
            </div>
            <button
              type="button"
              className="cq-onboard-school cq-onboard-school--selected"
              onClick={() => {
                void persistProfilePatch({ institutionId: "uri" });
                go("interests");
              }}
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
              onClick={() => {
                void persistProfilePatch({ institutionId: "uri" });
                go("interests");
              }}
            >
              Continue
            </button>
            <p className="cq-onboard-muted-link mt-4">Can&apos;t find your school?</p>
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
                onClick={() => void continueFromCommunities()}
              >
                Skip
              </button>
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--inline cq-onboard-btn-primary--glow disabled:opacity-50"
                disabled={submitting}
                onClick={() => void continueFromCommunities()}
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
            </div>
            {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
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
            <p className="cq-onboard-support">Use your URI email address (@uri.edu) to verify.</p>

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
