"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Lock, Mail, Search } from "lucide-react";
import { patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import {
  remainingResendCooldownMs,
  readResendCooldownState,
  writeResendCooldownState,
  startResendCooldown,
  formatResendCooldownLabel,
} from "@/lib/client/authResendCooldown";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
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

function KnightArt({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="cq-onboard-knight" aria-hidden={alt === ""}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="cq-onboard-knight-img" width={220} height={220} decoding="async" />
    </div>
  );
}

function ProgressDots({ active }: { active: number }) {
  if (active < 0) return null;
  return (
    <div className="cq-onboard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={active + 1}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`cq-onboard-dot ${i === active ? "cq-onboard-dot--active" : ""}`} />
      ))}
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
  const submitLock = useRef(false);
  const yearOptions = graduationYearOptions();

  const claims = readAccessTokenClaims(getAccessToken());
  const userEmail = claims?.email ?? "";
  const emailConfirmed =
    claims?.emailConfirmed === true || (!FEATURE_FLAGS.requireEmailVerification && Boolean(claims?.sub));

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

  // Preload next knight assets
  useEffect(() => {
    const next: Record<Step, string | null> = {
      welcome: BRAND_KNIGHT.welcoming,
      student_status: BRAND_KNIGHT.heroic,
      graduation_year: BRAND_KNIGHT.pointing,
      school: BRAND_KNIGHT.presenting,
      interests: BRAND_KNIGHT.pointing,
      communities: BRAND_KNIGHT.welcoming,
      email_verification: BRAND_KNIGHT.thumbsUp,
      success: null,
    };
    const src = next[step];
    if (!src) return;
    const img = new Image();
    img.src = src;
  }, [step]);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function toggleInterest(id: InterestId) {
    setInterests((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 15) return prev;
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
    if (FEATURE_FLAGS.requireEmailVerification && !emailConfirmed) {
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

  const whiteShell = step !== "welcome" && step !== "success";

  return (
    <div className={`cq-onboard-shell ${whiteShell ? "cq-onboard-shell--light" : "cq-onboard-shell--dark"}`}>
      {whiteShell ? (
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND_LOGO_OFFICIAL}
              alt="CampusQuest"
              className="cq-onboard-logo"
              width={88}
              height={88}
              decoding="async"
            />
            <KnightArt src={BRAND_KNIGHT.thumbsUp} alt="" />
            <h1 className="cq-onboard-title-dark">
              Welcome to <span className="cq-onboard-title-accent">CampusQuest</span>
            </h1>
            <p className="cq-onboard-sub-dark">
              Your campus. Your community.
              <br />
              Your quest.
            </p>
            <button type="button" className="cq-onboard-btn-gold" onClick={() => go("student_status")}>
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
            <KnightArt src={BRAND_KNIGHT.welcoming} alt="" />
            <h2 className="cq-onboard-question">Are you a current or incoming college student?</h2>
            <div className="cq-onboard-stack mt-6">
              {STUDENT_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`cq-onboard-choice ${studentStatus === opt.id ? "cq-onboard-choice--primary" : ""}`}
                  onClick={() => {
                    setStudentStatus(opt.id);
                    go("graduation_year");
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "graduation_year" ? (
          <div className="cq-onboard-step">
            <KnightArt src={BRAND_KNIGHT.heroic} alt="" />
            <h2 className="cq-onboard-question">When do you graduate?</h2>
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
            <KnightArt src={BRAND_KNIGHT.pointing} alt="" />
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
            </button>
            <p className="cq-onboard-muted-link mt-4">Can&apos;t find your school?</p>
          </div>
        ) : null}

        {step === "interests" ? (
          <div className="cq-onboard-step">
            <KnightArt src={BRAND_KNIGHT.presenting} alt="" />
            <h2 className="cq-onboard-question">What are you interested in?</h2>
            <p className="cq-onboard-support">Pick at least {MIN_INTERESTS} to personalize your feed.</p>
            <div className="cq-onboard-chip-grid" role="group" aria-label="Interests">
              {INTEREST_OPTIONS.map((opt) => {
                const selected = interests.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    className={`cq-onboard-chip ${selected ? "cq-onboard-chip--selected" : ""}`}
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
              className="cq-onboard-btn-primary mt-6 disabled:opacity-40"
              onClick={() => go("communities")}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === "communities" ? (
          <div className="cq-onboard-step">
            <KnightArt src={BRAND_KNIGHT.pointing} alt="" />
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
              <button type="button" className="cq-onboard-btn-primary cq-onboard-btn-primary--inline" onClick={() => go("email_verification")}>
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === "email_verification" ? (
          <div className="cq-onboard-step">
            <KnightArt src={BRAND_KNIGHT.welcoming} alt="" />
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
            {emailConfirmed ? (
              <p className="cq-onboard-success-note mt-3" role="status">
                Your email is verified.
              </p>
            ) : (
              <button
                type="button"
                className="cq-onboard-btn-primary mt-5 disabled:opacity-50"
                disabled={isResending || resendRemaining > 0 || !userEmail}
                onClick={() => void sendVerificationEmail()}
              >
                {isResending
                  ? "Sending…"
                  : resendRemaining > 0
                    ? formatResendCooldownLabel(resendRemaining)
                    : "Send Verification Email"}
              </button>
            )}
            {notice ? <p className="cq-onboard-notice mt-3">{notice}</p> : null}
            {error ? <p className="cq-onboard-error mt-3">{error}</p> : null}
            <button
              type="button"
              className="cq-onboard-btn-primary mt-6 disabled:opacity-50"
              disabled={FEATURE_FLAGS.requireEmailVerification && !emailConfirmed}
              onClick={() => go("success")}
            >
              Continue
            </button>
            <p className="cq-onboard-privacy mt-8">
              <Lock className="inline h-3.5 w-3.5" aria-hidden /> Your email stays private to CampusQuest account
              security.
            </p>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="cq-onboard-hero text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND_LOGO_OFFICIAL}
              alt="CampusQuest"
              className="cq-onboard-logo"
              width={88}
              height={88}
              decoding="async"
            />
            <div className="cq-onboard-confetti" aria-hidden />
            <KnightArt src={BRAND_KNIGHT.thumbsUp} alt="" />
            <h1 className="cq-onboard-title-gold">Preferences saved!</h1>
            <p className="cq-onboard-sub-dark font-semibold">Next: create your character.</p>
            <p className="cq-onboard-sub-dark mt-2">
              Then explore campus,
              <br />
              connect, and level up.
            </p>
            {error ? <p className="cq-onboard-error mt-4">{error}</p> : null}
            <button
              type="button"
              className="cq-onboard-btn-gold mt-8 disabled:opacity-60"
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
