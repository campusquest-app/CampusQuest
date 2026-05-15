"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { LegalConsentScreen } from "@/components/LegalConsentScreen";
import { getAccessToken } from "@/lib/client/apiSession";
import { consentPayloadAllowsAppAccess, type LegalConsentPayload } from "@/lib/client/agreementAccess";

type ApiResponse<T> = { data?: T; error?: { message?: string; code?: string } };

class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(`NETWORK_ERROR:${path}`);
  }
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    throw new HttpRequestError(
      payload?.error?.message ?? "Request failed.",
      path,
      response.status,
      response.statusText || "Unknown",
    );
  }
  return payload;
}

/** Dedicated agreement gate at `/agreement` — canonical return target from legal document pages. */
export function AgreementFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "consent" | "done">("checking");
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace("/");
        return;
      }
      try {
        const payload = await fetchJson<LegalConsentPayload & { currentPolicyVersion?: string }>(
          "/api/legal/consent/status",
          {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          },
        );
        if (cancelled) return;
        const ver = (payload?.data?.currentPolicyVersion as string | undefined) ?? DEFAULT_POLICY_VERSION;
        setConsentVersion(ver);
        if (consentPayloadAllowsAppAccess(payload?.data)) {
          setPhase("done");
          router.replace("/");
          return;
        }
        setPhase("consent");
      } catch {
        if (cancelled) return;
        setError("Could not verify your agreement status. Please try again or sign in.");
        setConsentVersion(DEFAULT_POLICY_VERSION);
        setPhase("consent");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }
      await fetchJson("/api/legal/consent/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedGuidelines: true,
        }),
      });
      setPhase("done");
      router.replace("/");
    } catch (e) {
      setError(e instanceof HttpRequestError ? e.message : "Could not save your agreement. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  if (phase === "checking" || phase === "done") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-4" aria-busy="true">
        <span className="inline-block h-8 w-8 rounded-full border-2 border-uri-keaney/40 border-t-uri-keaney animate-spin" />
        <p className="text-sm text-white/70">Loading…</p>
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
