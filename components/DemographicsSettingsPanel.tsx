"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { DrawerSubPanelShell } from "@/components/DrawerSubPanelShell";
import { fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { graduationYearOptions } from "@/lib/onboarding/graduationYear";
import {
  COMMUNITY_OPTIONS,
  INSTITUTIONS,
  INTEREST_OPTIONS,
  MIN_INTERESTS,
  type CommunityId,
  type InterestId,
  normalizeCommunityIds,
  normalizeInterestIds,
} from "@/lib/onboarding/taxonomy";

export function DemographicsSettingsPanel({ onBack }: { onBack: () => void }) {
  const [graduationYear, setGraduationYear] = useState<number | null>(null);
  const [graduateOther, setGraduateOther] = useState(false);
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [communities, setCommunities] = useState<CommunityId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const yearOptions = graduationYearOptions();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [profile, prefs] = await Promise.all([
          fetchAuthed<{ class_year?: number | null }>("/api/me/profile"),
          fetchAuthed<{
            preferences: { interests?: string[]; communities?: string[] } | null;
          }>("/api/me/onboarding-preferences"),
        ]);
        if (cancelled) return;
        const cy = profile.class_year ?? null;
        setGraduationYear(cy);
        setGraduateOther(cy == null);
        setInterests(normalizeInterestIds(prefs.preferences?.interests ?? []));
        setCommunities(normalizeCommunityIds(prefs.preferences?.communities ?? []));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load preferences.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (interests.length < MIN_INTERESTS) {
      setError(`Pick at least ${MIN_INTERESTS} interests.`);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await patchAuthed("/api/me/profile", {
        classYear: graduateOther ? null : graduationYear,
      });
      await postAuthed("/api/me/onboarding-preferences", {
        schoolName: INSTITUTIONS.uri.schoolName,
        interests,
        communities,
        institutionId: "uri",
        classYear: graduateOther ? null : graduationYear,
        discoveryFocus: ["events", "organizations", "meet_students"],
        major: "",
        markOnboardingComplete: false,
      });
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerSubPanelShell title="Interests & Communities" onBack={onBack}>
      <div className="space-y-5 px-1 pb-8">
        {loading ? <p className="text-sm text-white/55">Loading…</p> : null}

        <section>
          <h3 className="text-sm font-semibold text-white">Graduation year</h3>
          <div className="mt-2 grid gap-2">
            {yearOptions.map((opt) => {
              const selected =
                opt.year == null ? graduateOther : !graduateOther && graduationYear === opt.year;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    if (opt.year == null) {
                      setGraduateOther(true);
                      setGraduationYear(null);
                    } else {
                      setGraduateOther(false);
                      setGraduationYear(opt.year);
                    }
                  }}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${
                    selected
                      ? "border-uri-keaney/60 bg-uri-keaney/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/80"
                  }`}
                >
                  <span>{opt.label}</span>
                  {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-white">Interests</h3>
          <p className="mt-1 text-xs text-white/45">Pick at least {MIN_INTERESTS}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const selected = interests.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setInterests((prev) =>
                      prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    selected
                      ? "border-uri-keaney bg-uri-keaney text-white"
                      : "border-white/15 text-white/75"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-white">Communities</h3>
          <p className="mt-1 text-xs text-white/45">Optional — choose any that apply.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMMUNITY_OPTIONS.map((opt) => {
              const selected = communities.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setCommunities((prev) =>
                      prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    selected
                      ? "border-uri-keaney bg-uri-keaney text-white"
                      : "border-white/15 text-white/75"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

        <button
          type="button"
          disabled={saving || loading || interests.length < MIN_INTERESTS}
          onClick={() => void save()}
          className="w-full rounded-xl bg-uri-keaney py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </DrawerSubPanelShell>
  );
}
