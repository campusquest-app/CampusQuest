import "server-only";
import { getAuthEmailRedirectUrl } from "@/lib/authRedirect";
import { logEmailVerification } from "@/lib/authEmailDelivery";
import { ApiError } from "@/lib/server/http";
import {
  createSupabaseCampusEmailStore,
  sendCampusEmailVerification,
} from "@/lib/server/campusEmailVerification";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";
import {
  decideResendVerification,
  deliverCampusVerificationForExistingUser,
  supabaseConfirmationAcceptedPayload,
} from "@/lib/server/resendSignupVerification";

async function lookupAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cq_auth_user_id_by_email", { p_email: email });
  if (error) {
    logEmailVerification("auth user lookup failed", { code: error.code ?? null });
    throw new ApiError(
      503,
      "We couldn't send that email right now. Please try again in a moment.",
      "AUTH_USER_LOOKUP_FAILED",
    );
  }
  return typeof data === "string" && data ? data : null;
}

async function sendCampusCode(userId: string, email: string) {
  return deliverCampusVerificationForExistingUser({
    email,
    lookupUserId: async () => userId,
    sendCode: async ({ userId: id, email: target }) => {
      const store = createSupabaseCampusEmailStore();
      return sendCampusEmailVerification({ userId: id, email: target, store });
    },
  });
}

/**
 * Resend the email a student still needs.
 * Confirmed Auth users (normal CampusQuest signups) receive the 6-digit URI code
 * directly, without asking Supabase to send a confirmation link it will refuse.
 * Unconfirmed legacy users still receive Supabase's confirmation link.
 */
export async function resendStudentVerificationEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const userId = await lookupAuthUserIdByEmail(normalized);
  if (userId) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) {
      logEmailVerification("auth user read failed", { code: error?.code ?? null });
      throw new ApiError(
        503,
        "We couldn't send that email right now. Please try again in a moment.",
        "AUTH_USER_LOOKUP_FAILED",
      );
    }
    const confirmed = Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at);
    if (confirmed) {
      logEmailVerification("resend using campus code", {});
      return sendCampusCode(userId, normalized);
    }
  }

  const supabase = createPublicClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalized,
    options: { emailRedirectTo: getAuthEmailRedirectUrl() },
  });

  const decision = decideResendVerification(error);
  if (decision.kind === "reject") {
    logEmailVerification("resend provider error", {
      code: error?.code ?? null,
      status: error?.status ?? null,
    });
    throw decision.error;
  }

  if (decision.kind === "supabase_confirmation_accepted") {
    return supabaseConfirmationAcceptedPayload();
  }

  if (!userId) {
    throw new ApiError(
      502,
      "We couldn't send your code. Please try again.",
      "EMAIL_VERIFICATION_SEND_FAILED",
    );
  }
  logEmailVerification("resend falling back to campus code", {});
  return sendCampusCode(userId, normalized);
}
