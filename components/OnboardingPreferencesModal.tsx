"use client";

import { useState } from "react";
import { postAuthed } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";

type DiscoveryFocus = "events" | "organizations" | "meet_students";

const INTEREST_OPTIONS = ["Career", "Wellness", "Tech", "Arts", "Sports", "Community", "Academics", "Networking"];

export type OnboardingPreferencesResult = {
  schoolName: string;
  interests: string[];
  discoveryFocus: DiscoveryFocus[];
  major?: string | null;
};

export function OnboardingPreferencesModal({
  onCompleted,
}: {
  onCompleted: (preferences: OnboardingPreferencesResult) => void;
}) {
  const [schoolName, setSchoolName] = useState("");
  const [major, setMajor] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [focus, setFocus] = useState<DiscoveryFocus[]>(["events", "organizations", "meet_students"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value].slice(0, 8)));
  }

  function toggleFocus(value: DiscoveryFocus) {
    setFocus((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value].slice(0, 3)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (schoolName.trim().length < 2) {
      setError("Choose your school/university.");
      return;
    }
    const mj = major.trim();
    if (mj.length === 1) {
      setError("Enter a complete major (at least 2 characters) or leave the field blank.");
      return;
    }
    if (interests.length === 0) {
      setError("Pick at least one interest.");
      return;
    }
    if (focus.length === 0) {
      setError("Pick at least one discovery goal.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await postAuthed<
        { preferences: OnboardingPreferencesResult },
        Record<string, unknown>
      >("/api/me/onboarding-preferences", {
        schoolName: schoolName.trim(),
        interests,
        discoveryFocus: focus,
        ...(mj.length >= 2 ? { major: mj } : { major: "" }),
      });
      onCompleted({
        ...data.preferences,
        major: data.preferences.major ?? null,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save onboarding preferences.");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof window === "undefined") return null;
  if (!getAccessToken()) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/65 p-3">
      <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-4">
        <div>
          <h2 className="text-white font-display text-xl font-bold">Set up your CampusQuest discovery</h2>
          <p className="text-sm text-white/65 mt-1">
            Tell us what matters most so Events, Orgs, Friends, and your notifications feel relevant from day one.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">School / University</span>
          <input
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            placeholder="e.g. University of Rhode Island"
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Major <span className="font-normal normal-case text-white/45">(optional)</span>
          </span>
          <input
            value={major}
            onChange={(event) => setMajor(event.target.value.slice(0, 120))}
            placeholder="e.g. Mechanical Engineering"
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
          />
        </label>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Interests</p>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleInterest(option)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                  interests.includes(option)
                    ? "border-uri-keaney/50 bg-uri-keaney/20 text-uri-keaney"
                    : "border-white/20 text-white/75 hover:bg-white/10"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">What do you want to discover?</p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "events", label: "Events" },
              { id: "organizations", label: "Organizations" },
              { id: "meet_students", label: "Meet students" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleFocus(option.id as DiscoveryFocus)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                  focus.includes(option.id as DiscoveryFocus)
                    ? "border-uri-keaney/50 bg-uri-keaney/20 text-uri-keaney"
                    : "border-white/20 text-white/75 hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Continue to CampusQuest"}
        </button>
      </form>
    </div>
  );
}
