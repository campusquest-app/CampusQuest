"use client";

import { consentPayloadAllowsAppAccess, type LegalConsentPayload } from "@/lib/client/agreementAccess";
import {
  ensureFreshAccessToken,
  refreshClientSession,
} from "@/lib/client/supabaseSession";
import { AGREEMENT_ERROR_CODES } from "@/lib/legal/agreementErrors";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";

export type LegalConsentStatusPayload = LegalConsentPayload & {
  currentPolicyVersion?: string;
  requiredReacceptance?: boolean;
};

export type LegalConsentGateResult =
  | { kind: "complete"; data: LegalConsentStatusPayload }
  | { kind: "required"; data: LegalConsentStatusPayload }
  | { kind: "unauthenticated" }
  | { kind: "temporary_error"; message: string };

type ApiEnvelope<T> = { data?: T; error?: { message?: string; code?: string } };

function versionFrom(data: LegalConsentStatusPayload | undefined): string {
  return data?.currentPolicyVersion?.trim() || DEFAULT_POLICY_VERSION;
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
}

async function fetchWithBearer(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}

/**
 * Load agreement status for a restored Capacitor/web session.
 * Refreshes an expired access token at most once. Temporary failures are distinct from sign-out.
 */
export async function loadLegalConsentGate(): Promise<LegalConsentGateResult> {
  const fresh = await ensureFreshAccessToken();
  if (fresh.outcome === "missing" || !fresh.token) {
    return { kind: "unauthenticated" };
  }

  try {
    return await requestConsentStatus(fresh.token, {
      refreshAttempted: fresh.refreshed,
      refreshWasTemporary: fresh.outcome === "temporary",
    });
  } catch {
    return {
      kind: "temporary_error",
      message: "Could not verify your agreement status. Please try again.",
    };
  }
}

async function requestConsentStatus(
  token: string,
  opts: { refreshAttempted: boolean; refreshWasTemporary: boolean },
): Promise<LegalConsentGateResult> {
  let response: Response;
  try {
    response = await fetchWithBearer("/api/legal/consent/status", token);
  } catch {
    return {
      kind: "temporary_error",
      message: "Could not verify your agreement status. Please try again.",
    };
  }

  if (response.status === 401) {
    if (!opts.refreshAttempted) {
      const refreshed = await refreshClientSession();
      if (refreshed.outcome === "ok" && refreshed.accessToken) {
        return requestConsentStatus(refreshed.accessToken, {
          refreshAttempted: true,
          refreshWasTemporary: false,
        });
      }
      if (refreshed.outcome === "temporary") {
        return {
          kind: "temporary_error",
          message: "Could not verify your agreement status. Please try again.",
        };
      }
      return { kind: "unauthenticated" };
    }
    if (opts.refreshWasTemporary) {
      return {
        kind: "temporary_error",
        message: "Could not verify your agreement status. Please try again.",
      };
    }
    return { kind: "unauthenticated" };
  }

  const payload = await readEnvelope<LegalConsentStatusPayload>(response);

  if (response.status === 401 || payload.error?.code === AGREEMENT_ERROR_CODES.AUTH_MISSING || payload.error?.code === AGREEMENT_ERROR_CODES.AUTH_INVALID) {
    return { kind: "unauthenticated" };
  }

  if (!response.ok) {
    return {
      kind: "temporary_error",
      message: payload.error?.message ?? "Could not verify your agreement status. Please try again.",
    };
  }

  const data = payload.data ?? {};
  data.currentPolicyVersion = versionFrom(data);
  if (consentPayloadAllowsAppAccess(data)) {
    return { kind: "complete", data };
  }
  return { kind: "required", data };
}

export async function submitLegalConsentAccept(): Promise<LegalConsentGateResult> {
  const fresh = await ensureFreshAccessToken();
  if (fresh.outcome === "missing" || !fresh.token) {
    return { kind: "unauthenticated" };
  }

  const send = async (
    token: string,
    opts: { refreshAttempted: boolean; refreshWasTemporary: boolean },
  ): Promise<LegalConsentGateResult> => {
    let response: Response;
    try {
      response = await fetchWithBearer("/api/legal/consent/accept", token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedGuidelines: true,
          acceptedDataConsent: true,
        }),
      });
    } catch {
      return {
        kind: "temporary_error",
        message: "Could not save your agreement. Please try again.",
      };
    }

    if (response.status === 401) {
      if (!opts.refreshAttempted) {
        const refreshed = await refreshClientSession();
        if (refreshed.outcome === "ok" && refreshed.accessToken) {
          return send(refreshed.accessToken, { refreshAttempted: true, refreshWasTemporary: false });
        }
        if (refreshed.outcome === "temporary") {
          return {
            kind: "temporary_error",
            message: "Could not save your agreement. Please try again.",
          };
        }
        return { kind: "unauthenticated" };
      }
      if (opts.refreshWasTemporary) {
        return {
          kind: "temporary_error",
          message: "Could not save your agreement. Please try again.",
        };
      }
      return { kind: "unauthenticated" };
    }

    const payload = await readEnvelope<LegalConsentStatusPayload>(response);
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) {
      return {
        kind: "temporary_error",
        message: payload.error?.message ?? "Could not save your agreement. Please try again.",
      };
    }

    const after = await loadLegalConsentGate();
    if (after.kind === "complete" || after.kind === "required") return after;
    return { kind: "complete", data: { agreementComplete: true, currentPolicyVersion: DEFAULT_POLICY_VERSION } };
  };

  return send(fresh.token, {
    refreshAttempted: fresh.refreshed,
    refreshWasTemporary: fresh.outcome === "temporary",
  });
}

export function consentVersionLabel(data: LegalConsentStatusPayload | undefined): string {
  return versionFrom(data);
}
