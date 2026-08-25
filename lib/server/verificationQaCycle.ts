/**
 * Repeatable campus-email verification QA for the dedicated onboarding QA account.
 *
 * Resets only CampusQuest `campus_email_verified_at` and issues a fresh 6-digit code
 * through the same send path used by normal users (Resend).
 *
 * Never deletes/recreates the Supabase user, never changes the auth UUID,
 * never sets email_confirm false, never uses signup resend / magic-link OTP
 * for this QA cycle.
 */

import { ApiError } from "@/lib/server/http";
import { logOnboardingQa } from "@/lib/onboardingQa";
import {
  canInvokeVerificationQaCycle,
  normalizeVerificationQaEmail,
} from "@/lib/verificationQaCycle";
import {
  createSupabaseCampusEmailStore,
  getCampusEmailVerificationStatus,
  sendCampusEmailVerification,
  type CampusEmailStore,
  type CampusEmailVerificationStatus,
} from "@/lib/server/campusEmailVerification";

export { canInvokeVerificationQaCycle } from "@/lib/verificationQaCycle";

export function assertVerificationQaCaller(args: {
  authenticatedEmail?: string | null;
}): string {
  const email = normalizeVerificationQaEmail(args.authenticatedEmail);
  if (!canInvokeVerificationQaCycle(email)) {
    throw new ApiError(
      403,
      "Verification QA cycles are limited to the designated internal QA account.",
      "VERIFICATION_QA_FORBIDDEN",
    );
  }
  return email;
}

export type VerificationQaChecklist = {
  authenticated: boolean;
  verificationStateReset: boolean;
  codeGenerated: boolean;
  emailDispatched: boolean;
  codeSubmitted: boolean;
  codeValidated: boolean;
  verificationStored: boolean;
  onboardingContinued: boolean;
};

export type VerificationQaCycleView = {
  eligible: boolean;
  email: string;
  campusEmailVerified: boolean;
  campusEmailVerifiedAt: string | null;
  authUserId: string;
  checklist: VerificationQaChecklist;
  status: CampusEmailVerificationStatus;
};

export async function getVerificationQaCycleView(args: {
  userId: string;
  authenticatedEmail: string;
  store?: CampusEmailStore;
}): Promise<VerificationQaCycleView> {
  const email = assertVerificationQaCaller({ authenticatedEmail: args.authenticatedEmail });
  const store = args.store ?? createSupabaseCampusEmailStore();
  const status = await getCampusEmailVerificationStatus({
    userId: args.userId,
    email,
    store,
  });
  return {
    eligible: true,
    email,
    campusEmailVerified: status.verified,
    campusEmailVerifiedAt: status.verifiedAt,
    authUserId: args.userId,
    status,
    checklist: {
      authenticated: true,
      verificationStateReset: !status.verified,
      codeGenerated: status.hasActiveChallenge || status.consumed || status.dispatched,
      emailDispatched: status.dispatched || status.consumed,
      codeSubmitted: status.submitted,
      codeValidated: status.consumed || status.verified,
      verificationStored: status.verified,
      onboardingContinued: status.verified,
    },
  };
}

export async function startVerificationQaCycle(args: {
  userId: string;
  authenticatedEmail: string;
  store?: CampusEmailStore;
  mailer?: (mail: { to: string; code: string }) => Promise<void>;
  generateCode?: () => string;
  secret?: string;
  now?: Date;
}): Promise<{
  emailSent: boolean;
  alreadySent: boolean;
  message: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  authUserId: string;
}> {
  const email = assertVerificationQaCaller({ authenticatedEmail: args.authenticatedEmail });
  const store = args.store ?? createSupabaseCampusEmailStore();

  logOnboardingQa("verification qa campus-code cycle starting", { userId: args.userId });

  const result = await sendCampusEmailVerification({
    userId: args.userId,
    email,
    resetIfQa: true,
    store,
    mailer: args.mailer,
    generateCode: args.generateCode,
    secret: args.secret,
    now: args.now,
  });

  logOnboardingQa("verification qa campus-code dispatched", {
    userId: args.userId,
    alreadyVerified: result.alreadyVerified,
  });

  return {
    emailSent: !result.alreadyVerified,
    alreadySent: false,
    message: "Test email sent. Open the newest email and enter the 6-digit code.",
    expiresInSeconds: result.expiresInSeconds,
    resendAvailableInSeconds: result.resendAvailableInSeconds,
    authUserId: args.userId,
  };
}
