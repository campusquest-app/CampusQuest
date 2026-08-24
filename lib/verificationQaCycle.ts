/**
 * Shared, isomorphic helpers for repeatable verification QA.
 * Safe to import from client or server — no Node/Supabase/secrets.
 */

import { isOnboardingQaEmail, ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import { normalizeEmail } from "@/lib/platformAdmin";

export const VERIFICATION_QA_APP_META_KEY = "cq_verification_qa" as const;

export type VerificationQaCycleStatus = "pending" | "completed";

export type VerificationQaCycleMeta = {
  cycleId: string;
  status: VerificationQaCycleStatus;
  startedAt: string;
  initialEmailSentAt: string | null;
};

type AppMetadata = Record<string, unknown>;

export function parseVerificationQaCycleMeta(appMetadata: unknown): VerificationQaCycleMeta | null {
  if (!appMetadata || typeof appMetadata !== "object" || Array.isArray(appMetadata)) return null;
  const raw = (appMetadata as AppMetadata)[VERIFICATION_QA_APP_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Partial<VerificationQaCycleMeta>;
  if (typeof row.cycleId !== "string" || !row.cycleId.trim()) return null;
  if (row.status !== "pending" && row.status !== "completed") return null;
  if (typeof row.startedAt !== "string" || !row.startedAt) return null;
  return {
    cycleId: row.cycleId.trim(),
    status: row.status,
    startedAt: row.startedAt,
    initialEmailSentAt:
      typeof row.initialEmailSentAt === "string" && row.initialEmailSentAt
        ? row.initialEmailSentAt
        : null,
  };
}

/** Only the dedicated onboarding QA account may start a verification QA cycle. */
export function canInvokeVerificationQaCycle(email?: string | null): boolean {
  return isOnboardingQaEmail(email);
}

export function shouldReusePendingCycleEmail(args: {
  cycle: VerificationQaCycleMeta | null;
  requestedCycleId?: string | null;
}): boolean {
  if (!args.cycle || args.cycle.status !== "pending") return false;
  if (!args.cycle.initialEmailSentAt) return false;
  const requested = (args.requestedCycleId ?? "").trim();
  if (!requested) return false;
  return requested === args.cycle.cycleId;
}

/** While a QA cycle is pending, never auto-confirm — that would fake verification. */
export function shouldSkipAutoConfirmForVerificationQa(appMetadata: unknown): boolean {
  const cycle = parseVerificationQaCycleMeta(appMetadata);
  return cycle?.status === "pending";
}

/**
 * UI gate: during an active QA cycle, only authoritative auth confirmation counts.
 * Normal users keep feature-flag behavior.
 */
export function isEmailVerifiedForOnboardingUi(args: {
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  hasSession: boolean;
  qaCyclePending: boolean;
}): boolean {
  if (args.qaCyclePending) {
    return args.emailConfirmedAuthoritative;
  }
  if (args.emailConfirmedAuthoritative) return true;
  if (!args.requireEmailVerification && args.hasSession) return true;
  return false;
}

export function shouldBlockContinueForVerification(args: {
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  qaCyclePending: boolean;
}): boolean {
  if (args.qaCyclePending) return !args.emailConfirmedAuthoritative;
  if (!args.requireEmailVerification) return false;
  return !args.emailConfirmedAuthoritative;
}

export function buildPendingCycleMeta(args: {
  cycleId: string;
  startedAt: string;
  initialEmailSentAt?: string | null;
}): VerificationQaCycleMeta {
  return {
    cycleId: args.cycleId,
    status: "pending",
    startedAt: args.startedAt,
    initialEmailSentAt: args.initialEmailSentAt ?? null,
  };
}

export function mergeVerificationQaAppMetadata(
  existing: AppMetadata | null | undefined,
  cycle: VerificationQaCycleMeta | null,
): AppMetadata {
  const next: AppMetadata = { ...(existing ?? {}) };
  if (!cycle) {
    delete next[VERIFICATION_QA_APP_META_KEY];
    return next;
  }
  next[VERIFICATION_QA_APP_META_KEY] = cycle;
  return next;
}

export function verificationQaAllowlistEmail(): string {
  return ONBOARDING_QA_EMAIL;
}

export function normalizeVerificationQaEmail(email?: string | null): string {
  return normalizeEmail(email);
}
