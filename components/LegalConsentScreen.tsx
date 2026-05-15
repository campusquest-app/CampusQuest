"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";

type Props = {
  onContinue: () => Promise<void>;
  isSubmitting?: boolean;
  versionLabel?: string | null;
};

const linkClass =
  "inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/90 transition-all hover:bg-white/[0.12] hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-uri-keaney/60";

export function LegalConsentScreen({ onContinue, isSubmitting = false, versionLabel }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(() => agreed && !isSubmitting, [agreed, isSubmitting]);

  async function handleContinue() {
    if (!agreed || isSubmitting) return;
    setError(null);
    try {
      await onContinue();
    } catch {
      setError("Could not save your policy agreement. Please try again.");
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/75 backdrop-blur-xl shadow-2xl shadow-black/30 p-5 sm:p-8 animate-[onboarding-enter_380ms_ease-out_forwards]">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Before You Continue</h1>
        <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed">
          To help keep CampusQuest safe, respectful, and trusted for all students, you must review and agree to our
          policies before using the platform.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href={LEGAL_DOC_LINKS.privacy} className={linkClass}>
            Privacy Policy
          </Link>
          <Link href={LEGAL_DOC_LINKS.terms} className={linkClass}>
            Terms of Service
          </Link>
          <Link href={LEGAL_DOC_LINKS.guidelines} className={linkClass}>
            Community Guidelines
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-4 sm:p-5">
          <label htmlFor="legal-consent-checkbox" className="flex items-start gap-3 cursor-pointer select-none">
            <input
              id="legal-consent-checkbox"
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-uri-keaney focus:ring-uri-keaney/80"
              aria-required="true"
            />
            <span className="text-xs sm:text-sm leading-relaxed text-white/80">
              I have read and agree to the Privacy Policy, Terms of Service, and Community Guidelines. I understand
              that violations of these policies may result in account suspension, removal from CampusQuest, and
              possible referral to my university&apos;s student conduct process or applicable authorities when
              necessary.
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className={`mt-6 w-full rounded-xl py-3.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-uri-navy ${
            canContinue
              ? "bg-uri-keaney text-white hover:bg-uri-keaney/90 focus:ring-uri-keaney shadow-lg shadow-uri-keaney/25"
              : "bg-white/10 text-white/45 border border-white/10 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Saving agreement..." : "Continue"}
        </button>

        <p className="mt-4 text-[11px] sm:text-xs text-amber-200/85 leading-relaxed">
          CampusQuest is intended to support positive student engagement. Harassment, threats, scams, impersonation,
          discriminatory behavior, or unsafe conduct are strictly prohibited.
        </p>
        {versionLabel ? <p className="mt-2 text-[10px] text-white/40">Policy version: {versionLabel}</p> : null}
      </div>
    </div>
  );
}
