"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { LegalConsentScreen } from "@/components/LegalConsentScreen";
import {
  loadLegalConsentGate,
  submitLegalConsentAccept,
} from "@/lib/client/legalConsentClient";
import { invalidateInvalidClientSession } from "@/lib/client/invalidateAuthSession";

type GatePhase = "loading" | "consent" | "temporary_error" | "unauthenticated" | "done";

/** Dedicated agreement gate at `/agreement` — canonical return target from legal document pages. */
export function AgreementFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<GatePhase>("loading");
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadGeneration, setLoadGeneration] = useState(0);

  const runStatusCheck = useCallback(async () => {
    setPhase("loading");
    setError(null);
    const result = await loadLegalConsentGate();
    if (result.kind === "unauthenticated") {
      setPhase("unauthenticated");
      router.replace("/");
      return;
    }
    if (result.kind === "temporary_error") {
      setError(result.message);
      setConsentVersion(DEFAULT_POLICY_VERSION);
      setPhase("temporary_error");
      return;
    }
    setConsentVersion(result.data.currentPolicyVersion ?? DEFAULT_POLICY_VERSION);
    if (result.kind === "complete") {
      setPhase("done");
      router.replace("/");
      return;
    }
    setPhase("consent");
  }, [router]);

  useEffect(() => {
    void runStatusCheck();
  }, [runStatusCheck, loadGeneration]);

  const handleContinue = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitLegalConsentAccept();
      if (result.kind === "unauthenticated") {
        setPhase("unauthenticated");
        router.replace("/");
        return;
      }
      if (result.kind === "temporary_error") {
        setError(result.message);
        return;
      }
      if (result.kind === "complete") {
        setPhase("done");
        router.replace("/");
        return;
      }
      setConsentVersion(result.data.currentPolicyVersion ?? DEFAULT_POLICY_VERSION);
      setError("Your agreement is still required. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  const handleSignOut = useCallback(async () => {
    await invalidateInvalidClientSession({ reason: "agreement_gate_sign_out", notify: false });
    router.replace("/");
  }, [router]);

  if (phase === "loading" || phase === "done" || phase === "unauthenticated") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-4" aria-busy="true">
        <span className="inline-block h-8 w-8 rounded-full border-2 border-uri-keaney/40 border-t-uri-keaney animate-spin" />
        <p className="text-sm text-white/70">Loading…</p>
      </div>
    );
  }

  if (phase === "temporary_error") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/75 backdrop-blur-xl shadow-2xl shadow-black/30 p-5 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Before You Continue</h1>
          <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed">
            {error ?? "Could not verify your agreement status. Please try again."}
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setLoadGeneration((n) => n + 1)}
              className="rounded-xl bg-uri-keaney py-3.5 text-sm font-semibold text-white hover:bg-uri-keaney/90"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-xl border border-white/15 bg-white/[0.06] py-3.5 text-sm font-semibold text-white/90 hover:bg-white/[0.12]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {error ? (
        <p className="mb-4 text-center text-xs text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3 py-2 mx-auto max-w-lg">
          {error}
        </p>
      ) : null}
      <LegalConsentScreen
        onContinue={handleContinue}
        isSubmitting={isSubmitting}
        versionLabel={consentVersion ?? DEFAULT_POLICY_VERSION}
      />
    </div>
  );
}
