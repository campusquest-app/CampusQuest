import {
  CAMPUS_EMAIL_USER_MESSAGES,
  isAllowedCampusVerificationEmail,
} from "@/lib/campusEmailVerification";
import {
  authEmailAcceptedPayload,
  classifyAuthEmailProviderError,
  isAuthEmailRateLimitError,
  type AuthProviderErrorShape,
} from "@/lib/authEmailDelivery";
import { ApiError } from "@/lib/server/http";

export function isSupabaseSignupAlreadyConfirmedError(error: AuthProviderErrorShape): boolean {
  const code = (error.code ?? "").toLowerCase().trim();
  const message = (error.message ?? "").toLowerCase().trim();
  return (
    code === "email_exists" ||
    message.includes("already confirmed") ||
    message.includes("already been confirmed")
  );
}

export type ResendVerificationDecision =
  | { kind: "supabase_confirmation_accepted" }
  | { kind: "send_campus_code" }
  | { kind: "reject"; error: ApiError };

/**
 * New CampusQuest accounts are created with Auth email already confirmed, so
 * Supabase will not send a signup confirmation link. Those users need the
 * app's 6-digit URI code. Unconfirmed legacy users still get Supabase's link.
 */
export function decideResendVerification(error: AuthProviderErrorShape | null): ResendVerificationDecision {
  if (!error) return { kind: "supabase_confirmation_accepted" };
  if (isAuthEmailRateLimitError(error)) {
    return { kind: "reject", error: classifyAuthEmailProviderError(error, "resend") };
  }
  if (isSupabaseSignupAlreadyConfirmedError(error)) {
    return { kind: "send_campus_code" };
  }
  return { kind: "reject", error: classifyAuthEmailProviderError(error, "resend") };
}

export async function deliverCampusVerificationForExistingUser(args: {
  email: string;
  lookupUserId: (email: string) => Promise<string | null>;
  sendCode: (input: { userId: string; email: string }) => Promise<{
    alreadyVerified: boolean;
    resendAvailableInSeconds: number;
  }>;
}): Promise<{
  accepted: true;
  delivered: boolean;
  alreadyVerified: boolean;
  channel: "campus_code";
  message: string;
  resendAvailableInSeconds: number;
}> {
  const email = args.email.trim().toLowerCase();
  if (!isAllowedCampusVerificationEmail(email)) {
    throw new ApiError(403, CAMPUS_EMAIL_USER_MESSAGES.domain, "EMAIL_VERIFICATION_DOMAIN");
  }

  const userId = await args.lookupUserId(email);
  if (!userId) {
    throw new ApiError(502, CAMPUS_EMAIL_USER_MESSAGES.sendFailed, "EMAIL_VERIFICATION_SEND_FAILED");
  }

  const result = await args.sendCode({ userId, email });
  if (result.alreadyVerified) {
    return {
      accepted: true,
      delivered: false,
      alreadyVerified: true,
      channel: "campus_code",
      message: CAMPUS_EMAIL_USER_MESSAGES.alreadyVerified,
      resendAvailableInSeconds: 0,
    };
  }

  return {
    accepted: true,
    delivered: true,
    alreadyVerified: false,
    channel: "campus_code",
    message: CAMPUS_EMAIL_USER_MESSAGES.sent,
    resendAvailableInSeconds: result.resendAvailableInSeconds,
  };
}

export function supabaseConfirmationAcceptedPayload() {
  return { ...authEmailAcceptedPayload("resend"), channel: "supabase_confirmation" as const };
}
