"use client";

import { useState } from "react";
import { patchAuthed, postAuthed } from "@/lib/client/dashboardApi";

const YEAR_OPTIONS = [
  { id: "freshman", label: "Freshman" },
  { id: "sophomore", label: "Sophomore" },
  { id: "junior", label: "Junior" },
  { id: "senior", label: "Senior" },
  { id: "graduate", label: "Graduate Student" },
] as const;

const INTEREST_OPTIONS = [
  "Clubs",
  "Sports",
  "Leadership",
  "Career Development",
  "Volunteering",
  "Social Events",
  "Research",
  "Networking",
] as const;

function graduationYearFor(yearId: (typeof YEAR_OPTIONS)[number]["id"]): number {
  const y = new Date().getFullYear();
  switch (yearId) {
    case "freshman":
      return y + 3;
    case "sophomore":
      return y + 2;
    case "junior":
      return y + 1;
    case "senior":
      return y;
    case "graduate":
      return y - 1;
    default:
      return y;
  }
}

type Step = 0 | 1 | 2 | 3;

export function AuthOnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [year, setYear] = useState<(typeof YEAR_OPTIONS)[number]["id"] | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value].slice(0, 8),
    );
  }

  async function finishOnboarding() {
    if (!year || interests.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await patchAuthed("/api/me/profile", {
        classYear: graduationYearFor(year),
      });
      await postAuthed("/api/me/onboarding-preferences", {
        schoolName: "University of Rhode Island",
        interests,
        discoveryFocus: ["events", "organizations", "meet_students"],
        major: "",
      });
      setSuccess("Profile Saved!");
      window.setTimeout(() => onComplete(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cq-auth-shell min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="cq-auth-card cq-auth-enter w-full max-w-[420px]">
        {step === 0 ? (
          <div className="cq-auth-onboard-step text-center">
            <p className="cq-auth-eyebrow">Welcome</p>
            <h2 className="cq-auth-title mt-2">Welcome to CampusQuest</h2>
            <p className="cq-auth-subtitle mt-3">You&apos;re ready to begin your adventure.</p>
            <button type="button" onClick={() => setStep(1)} className="cq-auth-btn-primary mt-8 w-full">
              Continue
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="cq-auth-onboard-step">
            <p className="cq-auth-eyebrow">About you</p>
            <h2 className="cq-auth-title mt-2">Select your year</h2>
            <div className="mt-5 grid grid-cols-1 gap-2.5">
              {YEAR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setYear(opt.id)}
                  className={`cq-auth-chip w-full justify-center py-3 ${year === opt.id ? "cq-auth-chip--active" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!year}
              onClick={() => setStep(2)}
              className="cq-auth-btn-primary mt-6 w-full disabled:opacity-45"
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="cq-auth-onboard-step">
            <p className="cq-auth-eyebrow">Interests</p>
            <h2 className="cq-auth-title mt-2">What are you into?</h2>
            <p className="cq-auth-subtitle mt-2">Pick as many as you like.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleInterest(opt)}
                  className={`cq-auth-chip ${interests.includes(opt) ? "cq-auth-chip--active" : ""}`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={interests.length === 0}
              onClick={() => setStep(3)}
              className="cq-auth-btn-primary mt-6 w-full disabled:opacity-45"
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="cq-auth-onboard-step text-center">
            <p className="cq-auth-eyebrow">All set</p>
            <h2 className="cq-auth-title mt-2">Profile Complete</h2>
            <p className="cq-auth-subtitle mt-3">Ready to start earning XP.</p>
            {error ? <p className="cq-auth-error mt-4">{error}</p> : null}
            {success ? <p className="cq-auth-success mt-4">{success}</p> : null}
            <button
              type="button"
              disabled={submitting || Boolean(success)}
              onClick={() => void finishOnboarding()}
              className="cq-auth-btn-primary mt-8 w-full disabled:opacity-60"
            >
              {submitting ? "Loading Adventure..." : success ? "Profile Saved!" : "Enter CampusQuest"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
