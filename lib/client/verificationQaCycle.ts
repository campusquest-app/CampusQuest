/**
 * Client helpers for repeatable verification QA cycles.
 * Never stores tokens, Resend keys, or service-role credentials.
 */

import {
  isEmailVerifiedForOnboardingUi,
  shouldBlockContinueForVerification,
} from "@/lib/verificationQaCycle";

export const VERIFICATION_QA_CYCLE_STORAGE_KEY = "cq_verification_qa_cycle_v1";

export type VerificationQaCycleClientRecord = {
  userId: string;
  cycleId: string;
};

export function readVerificationQaCycleRecord(): VerificationQaCycleClientRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VERIFICATION_QA_CYCLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VerificationQaCycleClientRecord>;
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    if (typeof parsed.cycleId !== "string" || !parsed.cycleId) return null;
    return { userId: parsed.userId, cycleId: parsed.cycleId };
  } catch {
    return null;
  }
}

export function writeVerificationQaCycleRecord(record: VerificationQaCycleClientRecord | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!record) {
      localStorage.removeItem(VERIFICATION_QA_CYCLE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(VERIFICATION_QA_CYCLE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode / quota — in-memory callers still hold cycleId.
  }
}

export function resolveStoredVerificationQaCycleId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const stored = readVerificationQaCycleRecord();
  if (!stored || stored.userId !== userId) return null;
  return stored.cycleId;
}

export function rememberVerificationQaCycle(userId: string, cycleId: string): void {
  writeVerificationQaCycleRecord({ userId, cycleId });
}

export function clearVerificationQaCycleRecord(): void {
  writeVerificationQaCycleRecord(null);
}

export function resolveEmailVerifiedForOnboardingUi(args: {
  email?: string | null;
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  hasSession: boolean;
  qaCyclePending?: boolean;
}): boolean {
  return isEmailVerifiedForOnboardingUi({
    emailConfirmedAuthoritative: args.emailConfirmedAuthoritative,
    requireEmailVerification: args.requireEmailVerification,
    hasSession: args.hasSession,
  });
}

export function resolveContinueBlockedForVerification(args: {
  emailConfirmedAuthoritative: boolean;
  requireEmailVerification: boolean;
  qaCyclePending?: boolean;
}): boolean {
  return shouldBlockContinueForVerification({
    emailConfirmedAuthoritative: args.emailConfirmedAuthoritative,
    requireEmailVerification: args.requireEmailVerification,
  });
}
