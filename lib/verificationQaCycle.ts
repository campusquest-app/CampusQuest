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
 * UI gate for onboarding “email verified” display.
 * QA delivery tests must not flip a verified account into “needs verification” copy —
 * callers should pass a sticky verified baseline for allowlisted QA accounts.
 */
export function isEmailVerifiedForOnboardingUi(args: {
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  hasSession: boolean;
  /** @deprecated Ignored — delivery tests must not rewrite verified UI status. */
  qaCyclePending?: boolean;
}): boolean {
  if (args.emailConfirmedAuthoritative) return true;
  if (!args.requireEmailVerification && args.hasSession) return true;
  return false;
}

/**
 * Continue gate for onboarding verification.
 * QA delivery/test emails must not block Continue — only real verification requirements do.
 */
export function shouldBlockContinueForVerification(args: {
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  /** @deprecated Ignored — QA test sends must not gate Continue. */
  qaCyclePending?: boolean;
}): boolean {
  if (!args.requireEmailVerification) return false;
  return !args.emailConfirmedAuthoritative;
}

/** Fixed copy for the allowlisted verification delivery test (onboarding UI). */
export const VERIFICATION_QA_UI_COPY = {
  statusAlreadyVerified: "Verification status: Already verified",
  sendTestButton: "Send test verification email",
  sending: "Sending test email...",
  sentSuccess: "Test email sent. Open the newest email to test the verification link.",
  sendFailedFallback: "Could not send the test verification email. Please try again.",
  rateLimited:
    "Supabase rate-limited this QA email. Wait about a minute, then try Send test verification email again.",
} as const;

export type VerificationQaTestUiState = "idle" | "sending" | "sent" | "failed";

export function resolveVerificationStatusLabel(args: {
  isQaAccount: boolean;
  qaAccountAlreadyVerified: boolean;
  emailConfirmedForUi: boolean;
}): { kind: "qa_already_verified" | "verified" | "needs_verification"; label: string } {
  if (args.isQaAccount && args.qaAccountAlreadyVerified) {
    return { kind: "qa_already_verified", label: VERIFICATION_QA_UI_COPY.statusAlreadyVerified };
  }
  if (args.emailConfirmedForUi) {
    return { kind: "verified", label: "Email verified." };
  }
  return { kind: "needs_verification", label: "Check your URI email." };
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
