"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { patchAuthed, postAuthed, fetchAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import { takeSignupVerificationDeliveryError } from "@/lib/client/signupVerificationDelivery";
import { shouldShowCampusVerificationQaControls } from "@/lib/onboardingQa";
import { CAMPUS_EMAIL_USER_MESSAGES, isCampusEmailVerified } from "@/lib/campusEmailVerification";
import { CampusEmailOtpInput } from "@/components/auth/CampusEmailOtpInput";
import { AcademicAreaPicker } from "@/components/auth/AcademicAreaPicker";
import { trackOnboardingEvent } from "@/lib/client/onboardingAnalytics";
import type { AcademicAreaId } from "@/lib/onboarding/academicAreas";
import {
  buildAvatarOnboardingSavePayload,
  canCompleteAvatarOnboarding,
  createDefaultAvatarConfig,
} from "@/lib/avatarConfig";
import { CHARACTER_CLASSES } from "@/lib/characterClasses";
import { graduationYearOptions } from "@/lib/onboarding/graduationYear";
import { shouldShowScrollCue } from "@/lib/onboarding/scrollCue";
import {
  BRAND_KNIGHT,
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
  sanitizeDraftAcademicArea,
  sanitizeDraftMajor,
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

const FEATURED_INTEREST_COUNT = 12;

function ambientForStep(step: Step): { density: OnboardingAmbientDensity; campusHaze: boolean } {
  if (step === "welcome") return { density: "normal", campusHaze: true };
  if (step === "ready") return { density: "celebrate", campusHaze: false };
  if (step === "campus") return { density: "calm", campusHaze: false };
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
  const initialMajor = sanitizeDraftMajor(draft?.major) ?? null;
  const initialAcademicArea = sanitizeDraftAcademicArea(draft?.academicArea) ?? null;

  const [step, setStep] = useState<Step>(() => {
    const resolved = resolveDemographicResumeStep({
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
    });
    return resolved === "welcome" ? "about_you" : resolved;
  });
  const [studentStatus, setStudentStatus] = useState<StudentStatusId | null>(initialStudentStatus);
  const [graduationYear, setGraduationYear] = useState<number | null>(initialYear);
  const [graduateOther, setGraduateOther] = useState(initialGraduateOther);
  const [institutionId] = useState<"uri">("uri");
  const [interests, setInterests] = useState<InterestId[]>(initialInterests);
  const [communities, setCommunities] = useState<CommunityId[]>(initialCommunities);
  const [major, setMajor] = useState<string | null>(initialMajor);
  const [academicArea, setAcademicArea] = useState<AcademicAreaId | null>(initialAcademicArea);
  const [showSchoolRequest, setShowSchoolRequest] = useState(false);
  const [requestedSchoolName, setRequestedSchoolName] = useState(draft?.requestedSchoolName ?? "");
  const [schoolRequestSaved, setSchoolRequestSaved] = useState(Boolean(draft?.requestedSchoolName));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => takeSignupVerificationDeliveryError());
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sparkInterestId, setSparkInterestId] = useState<InterestId | null>(null);
  const [showAllInterests, setShowAllInterests] = useState(false);
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
  const startedAtRef = useRef(Date.now());
  const trackedStart = useRef(false);

  function elapsedMs() {
    return Math.max(0, Date.now() - startedAtRef.current);
  }

  const yearOptions = graduationYearOptions(
    new Date(),
    studentStatus === "graduate_student" ? { extraFutureYears: 2 } : undefined,
  );
  const gradScrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollCue, setShowScrollCue] = useState(false);

  useEffect(() => {
    if (step === "welcome" || step === "ready") {
      setShowScrollCue(false);
      return undefined;
    }
    const scroller = gradScrollRef.current;
    if (!scroller) return undefined;

    const sync = () => {
      setShowScrollCue(
        shouldShowScrollCue({
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          scrollTop: scroller.scrollTop,
        }),
      );
    };

    sync();
    const frame = window.requestAnimationFrame(sync);
    scroller.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      observer.disconnect();
    };
  }, [step]);

  const claims = readAccessTokenClaims(getAccessToken());
  const userEmail = claims?.email ?? "";
  const isQaAccount = shouldShowCampusVerificationQaControls(userEmail);
  const continueBlocked = !campusVerified;
  const resendLocked = resendAvailableInSeconds > 0 || codeSending;
  // This flow only mounts after a session exists. The public welcome screen
  // stays on AuthScreen for logged-out users.
  const includeWelcome = false;
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
        major,
        academicArea,
        requestedSchoolName: requestedSchoolName.trim() || null,
      },
      userId,
    );
  }, [
    step,
    studentStatus,
    graduationYear,
    graduateOther,
    institutionId,
    interests,
    communities,
    major,
    academicArea,
    requestedSchoolName,
    userId,
  ]);

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
      about_you: BRAND_KNIGHT.welcoming,
      campus: BRAND_KNIGHT.presenting,
      personalize: BRAND_KNIGHT.presentingRight,
      ready: BRAND_KNIGHT.heroic,
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
    if (step !== "campus") return;
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
    major?: string | null;
    academicArea?: AcademicAreaId | null;
    requestedSchoolName?: string;
  }) {
    if (forceFullReplay || startAtEmailVerification) return;
    try {
      await patchAuthed("/api/me/profile", {
        ...patch,
        major: patch.major === undefined ? undefined : patch.major ?? "",
        academicArea: patch.academicArea === undefined ? undefined : patch.academicArea ?? "",
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
        setNotice(null);
      } else {
        setHasActiveChallenge(true);
        setCampusVerified(false);
        setOtpCode("");
        setNotice(CAMPUS_EMAIL_USER_MESSAGES.sent);
        trackOnboardingEvent({
          eventName: "onboarding_verification_sent",
          stepNumber: 2,
          elapsedMs: elapsedMs(),
        });
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
        setNotice(null);
        trackOnboardingEvent({
          eventName: "onboarding_verification_completed",
          stepNumber: 2,
          elapsedMs: elapsedMs(),
        });
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

  useEffect(() => {
    if (step === "welcome") setStep("about_you");
  }, [step]);

  useEffect(() => {
    if (trackedStart.current) return;
    if (step === "welcome" && !forceFullReplay) return;
    trackedStart.current = true;
    trackOnboardingEvent({ eventName: "onboarding_started", stepNumber: 1, elapsedMs: elapsedMs() });
  }, [step, forceFullReplay]);

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
      major: major ?? "",
      academicArea: academicArea ?? "",
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
      major: major ?? "",
      academicArea: academicArea ?? "",
      onboardingVersion: ONBOARDING_VERSION,
      markOnboardingComplete: false,
    });
  }

  const visibleInterests =
    showAllInterests || interests.some((id) => INTEREST_OPTIONS.findIndex((opt) => opt.id === id) >= FEATURED_INTEREST_COUNT)
      ? INTEREST_OPTIONS
      : INTEREST_OPTIONS.slice(0, FEATURED_INTEREST_COUNT);
  const aboutYouReady =
    Boolean(studentStatus) &&
    (!shouldAskGraduationYear(studentStatus) || graduateOther || graduationYear != null);
  const showQaVerification = process.env.NODE_ENV !== "production" && isQaAccount;

  async function continueFromAboutYou() {
    if (!aboutYouReady || !studentStatus) return;
    trackOnboardingEvent({
      eventName: "onboarding_status_completed",
      stepNumber: 1,
      elapsedMs: elapsedMs(),
    });
    void persistProfilePatch({
      studentStatus,
      classYear: graduateOther || !shouldAskGraduationYear(studentStatus) ? null : graduationYear,
      major: major ?? "",
      academicArea,
    });
    go("campus");
  }

  async function continueFromCampus() {
    if (!campusVerified) {
      setError("Verify your URI email before continuing.");
      return;
    }
    setError(null);
    void persistProfilePatch({ institutionId: "uri" });
    go("personalize");
  }

  async function continueFromPersonalize() {
    if (submitLock.current || submitting) return;
    if (!studentStatus || interests.length < MIN_INTERESTS) {
      setError("Pick at least 3 interests to continue.");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!forceFullReplay && !startAtEmailVerification) {
        await saveDemographics();
      }
      trackOnboardingEvent({
        eventName: "onboarding_communities_completed",
        stepNumber: 3,
        elapsedMs: elapsedMs(),
        skipped: communities.length === 0,
      });
      go("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Your progress is kept — try again.");
    } finally {
      setSubmitting(false);
      window.setTimeout(() => {
        submitLock.current = false;
      }, 600);
    }
  }

  async function saveStarterAvatar() {
    const profile = await fetchAuthed<{
      display_name?: string | null;
      username?: string | null;
      onboarding_character_completed?: boolean | null;
      onboarding_completed?: boolean | null;
    }>("/api/me/profile");
    if (profile.onboarding_character_completed === true || profile.onboarding_completed === true) return;
    const displayName = profile.display_name?.trim() ?? "";
    const username = profile.username?.trim() ?? "";
    const config = createDefaultAvatarConfig();
    if (!canCompleteAvatarOnboarding({ displayName, username, config })) {
      throw new Error("We couldn't assign a starter avatar. Customize your avatar instead.");
    }
    const starterWeapon = CHARACTER_CLASSES.find((entry) => entry.id === config.classType)?.starterWeapon ?? null;
    await patchAuthed("/api/me/profile", buildAvatarOnboardingSavePayload({
      displayName,
      username,
      config,
      starterWeapon,
    }));
  }

  async function finishAndExplore(customizeAvatar: boolean) {
    if (submitLock.current || submitting) return;
    if (continueBlocked) {
      setError("Verify your URI email before continuing.");
      go("campus");
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
      if (!startAtEmailVerification && !forceFullReplay) {
        await saveDemographics();
      }
      if (!customizeAvatar && !forceFullReplay) {
        await saveStarterAvatar();
      }
      trackOnboardingEvent({
        eventName: "onboarding_preferences_saved",
        elapsedMs: elapsedMs(),
      });
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

  const ambient = ambientForStep(step);
  const showBack =
    step !== "welcome" && step !== "about_you" && !(startAtEmailVerification && step === "campus");

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
        {step === "about_you" ? (
          <div className="cq-onboard-step cq-onboard-step--flow">
            <div ref={gradScrollRef} className="cq-onboard-grad-scroll">
              <div>
                <KnightStage src={BRAND_KNIGHT.welcoming} size="md" ring="md" />
                <h2 className="cq-onboard-question">Tell us about yourself</h2>
                <p className="cq-onboard-support">Help us personalize your CampusQuest experience.</p>
                <div className="cq-onboard-stack mt-5" role="group" aria-label="Role">
                  {STUDENT_STATUS_OPTIONS.map((opt) => {
                    const selected = studentStatus === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        className={`cq-onboard-choice cq-onboard-choice--row ${selected ? "cq-onboard-choice--selected" : ""}`}
                        onClick={() => setStudentStatus(opt.id)}
                      >
                        <span>{opt.label}</span>
                        {selected ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                {studentStatus && shouldAskGraduationYear(studentStatus) ? (
                  <div>
                    <label className="cq-onboard-field-label" htmlFor="cq-grad-year">
                      Expected graduation
                    </label>
                    <select
                      id="cq-grad-year"
                      className="cq-onboard-year-select"
                      value={graduateOther ? "other" : graduationYear == null ? "" : String(graduationYear)}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        if (value === "other") {
                          setGraduateOther(true);
                          setGraduationYear(null);
                          void persistProfilePatch({ studentStatus, classYear: null });
                          return;
                        }
                        const year = Number(value);
                        setGraduateOther(false);
                        setGraduationYear(year);
                        void persistProfilePatch({ studentStatus, classYear: year });
                      }}
                    >
                      <option value="">Select a year</option>
                      {yearOptions
                        .filter((opt) => opt.year != null)
                        .map((opt) => (
                          <option key={opt.year} value={opt.year ?? ""}>
                            {opt.label}
                          </option>
                        ))}
                      <option value="other">Not sure / Other</option>
                    </select>
                  </div>
                ) : null}
                {studentStatus ? (
                  <AcademicAreaPicker
                      academicArea={academicArea}
                      major={major}
                      onChange={(next) => {
                        setAcademicArea(next.academicArea);
                        setMajor(next.major);
                        void persistProfilePatch({
                          academicArea: next.academicArea,
                          major: next.major,
                        });
                      }}
                    />
                ) : null}
              </div>
            </div>
            <div
              className={`cq-onboard-scroll-cue ${showScrollCue ? "" : "cq-onboard-scroll-cue--off"}`}
              aria-hidden={showScrollCue ? undefined : true}
            >
              <span>Scroll for more</span>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </div>
            <div className="cq-onboard-sticky-footer">
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--glow disabled:opacity-40"
                disabled={!aboutYouReady}
                onClick={() => void continueFromAboutYou()}
              >
                Continue
              </button>
              {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
            </div>
          </div>
        ) : null}

        {step === "campus" ? (
          <div className="cq-onboard-step cq-onboard-step--flow">
            <div ref={gradScrollRef} className="cq-onboard-grad-scroll">
              <div>
                <KnightStage src={BRAND_KNIGHT.presenting} size="md" ring="md" />
                <h2 className="cq-onboard-question">Your campus</h2>
                <p className="cq-onboard-support">CampusQuest is currently live at the University of Rhode Island.</p>
                <button
                  type="button"
                  aria-pressed
                  className="cq-onboard-school cq-onboard-school--selected mt-5"
                  onClick={() => void persistProfilePatch({ institutionId: "uri" })}
                >
                  <span className="cq-onboard-school-mark" aria-hidden>
                    URI
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block font-semibold">{INSTITUTIONS.uri.name}</span>
                    <span className="block text-sm opacity-80">{INSTITUTIONS.uri.city}</span>
                  </span>
                  <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden />
                </button>
                {showSchoolRequest ? (
                  <div className="cq-onboard-school-request">
                    <label className="cq-onboard-field-label" htmlFor="cq-school-request">
                      Which school should we add?
                    </label>
                    <input
                      id="cq-school-request"
                      className="cq-onboard-year-select mt-2"
                      value={requestedSchoolName}
                      onChange={(event) => setRequestedSchoolName(event.target.value)}
                    />
                    <div className="mt-3 flex justify-end gap-3">
                      <button type="button" className="cq-onboard-text-btn" onClick={() => setShowSchoolRequest(false)}>
                        Never mind
                      </button>
                      <button
                        type="button"
                        className="cq-onboard-btn-primary cq-onboard-btn-primary--inline disabled:opacity-40"
                        disabled={requestedSchoolName.trim().length < 2}
                        onClick={() => {
                          const name = requestedSchoolName.trim();
                          setSchoolRequestSaved(true);
                          setShowSchoolRequest(false);
                          void persistProfilePatch({ requestedSchoolName: name, institutionId: "uri" });
                        }}
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="cq-onboard-muted-link" onClick={() => setShowSchoolRequest(true)}>
                    {schoolRequestSaved ? "School request saved" : "Can’t find your school?"}
                  </button>
                )}

                <h3 className="cq-onboard-section-label">Verify your URI email</h3>
                {campusVerified ? (
                  <p className="cq-onboard-verified">
                    <Check className="h-4 w-4" aria-hidden /> URI email verified
                  </p>
                ) : (
                  <>
                    <p className="cq-onboard-support">{emailMasked || userEmail || "your URI email"}</p>
                    {hasActiveChallenge ? (
                      <CampusEmailOtpInput
                        value={otpCode}
                        disabled={codeVerifying || codeSending}
                        onChange={(next) => {
                          setOtpCode(next);
                          setError(null);
                        }}
                        onComplete={(code) => void verifyCampusCode(code)}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="cq-onboard-btn-primary cq-onboard-btn-primary--glow mt-4 disabled:opacity-50"
                      disabled={codeSending || resendLocked}
                      onClick={() => void sendCampusCode()}
                    >
                      {codeSending ? "Sending…" : hasActiveChallenge ? "Resend code" : "Send verification code"}
                    </button>
                    {showQaVerification ? (
                      <button
                        type="button"
                        className="cq-onboard-muted-link"
                        disabled={qaSending}
                        onClick={() => void sendQaTestVerificationEmail()}
                      >
                        {qaSending ? "Sending test email..." : "Send test verification email"}
                      </button>
                    ) : null}
                    {notice ? <p className="cq-onboard-notice mt-3">{notice}</p> : null}
                  </>
                )}
              </div>
            </div>
            <div
              className={`cq-onboard-scroll-cue ${showScrollCue ? "" : "cq-onboard-scroll-cue--off"}`}
              aria-hidden={showScrollCue ? undefined : true}
            >
              <span>Scroll for more</span>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </div>
            <div className="cq-onboard-sticky-footer">
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--glow disabled:opacity-40"
                disabled={!campusVerified || submitting}
                onClick={() => void continueFromCampus()}
              >
                Continue
              </button>
              {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
            </div>
          </div>
        ) : null}

        {step === "personalize" ? (
          <div className={`cq-onboard-step cq-onboard-step--flow ${showScrollCue ? "cq-onboard-step--more" : ""}`}>
            <div ref={gradScrollRef} className="cq-onboard-grad-scroll">
              <div>
                <KnightStage src={BRAND_KNIGHT.presentingRight} size="md" ring="md" />
                <h2 className="cq-onboard-question">Make CampusQuest yours</h2>
                <p className="cq-onboard-support">
                  Choose a few things you care about. We’ll use them to personalize your feed, events, and recommendations.
                </p>
                <h3 className="cq-onboard-section-label">Interests</h3>
                <p className="cq-onboard-counter" aria-live="polite">
                  {interests.length < MIN_INTERESTS
                    ? `${interests.length} of ${MIN_INTERESTS} selected`
                    : `${interests.length} selected`}
                </p>
                <div className="cq-onboard-chip-grid" role="group" aria-label="Interests">
                  {visibleInterests.map((opt) => {
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
                {INTEREST_OPTIONS.length > FEATURED_INTEREST_COUNT ? (
                  <button type="button" className="cq-onboard-more" onClick={() => setShowAllInterests((open) => !open)}>
                    {showAllInterests ? "Show fewer interests" : "+ More interests"}
                  </button>
                ) : null}

                <h3 className="cq-onboard-section-label">
                  Campus communities <span className="font-semibold text-slate-400">(optional)</span>
                </h3>
                <p className="cq-onboard-support">Choose any that apply to you.</p>
                <div className="cq-onboard-community-grid" role="group" aria-label="Campus communities">
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
              </div>
            </div>
            <div
              className={`cq-onboard-scroll-cue ${showScrollCue ? "" : "cq-onboard-scroll-cue--off"}`}
              aria-hidden={showScrollCue ? undefined : true}
            >
              <span>Scroll for more</span>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </div>
            <div className="cq-onboard-sticky-footer">
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--glow disabled:opacity-40"
                disabled={interests.length < MIN_INTERESTS || submitting}
                onClick={() => void continueFromPersonalize()}
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
              {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
            </div>
          </div>
        ) : null}

        {step === "ready" ? (
          <div className="cq-onboard-step cq-onboard-step--flow">
            <div className="cq-onboard-grad-scroll">
              <div className="text-center">
                <KnightStage src={BRAND_KNIGHT.heroic} size="md" ring="md" />
                <h2 className="cq-onboard-question">You’re in.</h2>
                <p className="cq-onboard-support">Your CampusQuest is ready.</p>
                <p className="cq-onboard-support">Your campus is waiting.</p>
              </div>
            </div>
            <div className="cq-onboard-sticky-footer cq-onboard-actions-stack">
              <button
                type="button"
                className="cq-onboard-btn-primary cq-onboard-btn-primary--glow disabled:opacity-60"
                disabled={submitting}
                onClick={() => void finishAndExplore(false)}
              >
                {submitting ? "Saving…" : "Enter CampusQuest"}
              </button>
              <button
                type="button"
                className="cq-onboard-text-btn"
                disabled={submitting}
                onClick={() => void finishAndExplore(true)}
              >
                Customize avatar
              </button>
              {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
