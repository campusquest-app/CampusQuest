/**
 * Repeatable email-verification QA for the dedicated onboarding QA account.
 *
 * Architecture:
 * - Supabase Auth = authoritative verified state (`email_confirmed_at`)
 * - CampusQuest backend = starts cycle (unconfirm + request send) + idempotency
 * - Resend = delivery via Supabase Auth SMTP (existing integration; no client keys)
 * - /auth/callback = validates the real link and issues a confirmed session
 *
 * Never unverifies arbitrary users. Self-only for the allowlisted QA email.
 */

import { randomUUID } from "crypto";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { logOnboardingQa } from "@/lib/onboardingQa";
import { hasConfirmedEmail } from "@/lib/authAccess";
import { getAuthEmailRedirectUrl } from "@/lib/authRedirect";
import {
  classifyAuthEmailProviderError,
  logEmailVerification,
} from "@/lib/authEmailDelivery";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";
import {
  buildPendingCycleMeta,
  canInvokeVerificationQaCycle,
  mergeVerificationQaAppMetadata,
  normalizeVerificationQaEmail,
  parseVerificationQaCycleMeta,
  shouldReusePendingCycleEmail,
  shouldSkipAutoConfirmForVerificationQa,
  type VerificationQaCycleMeta,
  type VerificationQaCycleStatus,
} from "@/lib/verificationQaCycle";

export type {
  VerificationQaCycleMeta,
  VerificationQaCycleStatus,
} from "@/lib/verificationQaCycle";

export {
  canInvokeVerificationQaCycle,
  isEmailVerifiedForOnboardingUi,
  parseVerificationQaCycleMeta,
  shouldBlockContinueForVerification,
  shouldReusePendingCycleEmail,
  shouldSkipAutoConfirmForVerificationQa,
  verificationQaAllowlistEmail,
} from "@/lib/verificationQaCycle";

export type VerificationQaCycleView = {
  eligible: boolean;
  email: string;
  emailConfirmed: boolean;
  emailConfirmedAt: string | null;
  cycle: VerificationQaCycleMeta | null;
  cyclePending: boolean;
  requireAuthoritativeVerification: boolean;
};

type AppMetadata = Record<string, unknown>;

/**
 * Caller must be authenticated as the allowlisted email — never accept a target
 * email/userId from the client for unverifying.
 */
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

export function buildVerificationQaCycleView(user: User): VerificationQaCycleView {
  const email = normalizeVerificationQaEmail(user.email);
  const eligible = canInvokeVerificationQaCycle(email);
  const emailConfirmed = hasConfirmedEmail(user);
  const cycle = eligible ? parseVerificationQaCycleMeta(user.app_metadata) : null;
  const cyclePending = Boolean(cycle && cycle.status === "pending" && !emailConfirmed);
  return {
    eligible,
    email,
    emailConfirmed,
    emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
    cycle,
    cyclePending,
    requireAuthoritativeVerification: cyclePending,
  };
}

export type VerificationQaStartResult = {
  cycleId: string;
  emailSent: boolean;
  alreadySent: boolean;
  emailConfirmed: boolean;
  status: VerificationQaCycleStatus;
  message: string;
};

export type AdminUserOps = {
  getUserById: (userId: string) => Promise<User>;
  updateUserById: (
    userId: string,
    attributes: { email_confirm?: boolean; app_metadata?: AppMetadata },
  ) => Promise<User>;
};

export type SendConfirmationEmail = (email: string) => Promise<void>;

export async function createDefaultAdminUserOps(): Promise<AdminUserOps> {
  const admin = createAdminClient();
  return {
    async getUserById(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        throw new ApiError(404, "Auth user not found.", "AUTH_USER_NOT_FOUND");
      }
      return data.user;
    },
    async updateUserById(userId, attributes) {
      const { data, error } = await admin.auth.admin.updateUserById(userId, attributes);
      if (error || !data.user) {
        throw new ApiError(
          500,
          "Could not update verification QA state.",
          "VERIFICATION_QA_UPDATE_FAILED",
        );
      }
      return data.user;
    },
  };
}

export async function sendConfirmationViaSupabaseResend(email: string): Promise<void> {
  const supabase = createPublicClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthEmailRedirectUrl() },
  });
  if (error) {
    logEmailVerification("verification qa resend provider error", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
    throw classifyAuthEmailProviderError(error, "resend");
  }
  logEmailVerification("verification qa resend accepted", {});
}

/**
 * Start (or idempotently resume) a verification QA cycle.
 * Resets only Auth confirmation + QA cycle metadata — never profile/XP/admin/posts.
 */
export async function startVerificationQaCycle(args: {
  userId: string;
  authenticatedEmail: string;
  requestedCycleId?: string | null;
  adminOps: AdminUserOps;
  sendConfirmationEmail: SendConfirmationEmail;
  now?: Date;
  newCycleId?: () => string;
}): Promise<VerificationQaStartResult> {
  const email = assertVerificationQaCaller({ authenticatedEmail: args.authenticatedEmail });
  const nowIso = (args.now ?? new Date()).toISOString();
  const user = await args.adminOps.getUserById(args.userId);
  if (normalizeVerificationQaEmail(user.email) !== email) {
    throw new ApiError(
      403,
      "Verification QA cycles are limited to the designated internal QA account.",
      "VERIFICATION_QA_FORBIDDEN",
    );
  }

  const existing = parseVerificationQaCycleMeta(user.app_metadata);
  if (
    shouldReusePendingCycleEmail({
      cycle: existing,
      requestedCycleId: args.requestedCycleId,
    })
  ) {
    logOnboardingQa("verification qa cycle email already sent — idempotent skip", {
      userId: args.userId,
      cycleId: existing!.cycleId,
    });
    return {
      cycleId: existing!.cycleId,
      emailSent: false,
      alreadySent: true,
      emailConfirmed: false,
      status: "pending",
      message: "Check your URI email. A verification message was already sent for this QA cycle.",
    };
  }

  const cycleId = (args.newCycleId ?? randomUUID)();
  const pending = buildPendingCycleMeta({ cycleId, startedAt: nowIso, initialEmailSentAt: null });
  const appMetadata = mergeVerificationQaAppMetadata(user.app_metadata as AppMetadata, pending);

  await args.adminOps.updateUserById(args.userId, {
    email_confirm: false,
    app_metadata: appMetadata,
  });

  await args.sendConfirmationEmail(email);

  const sentMeta = buildPendingCycleMeta({
    cycleId,
    startedAt: nowIso,
    initialEmailSentAt: nowIso,
  });
  await args.adminOps.updateUserById(args.userId, {
    app_metadata: mergeVerificationQaAppMetadata(appMetadata, sentMeta),
  });

  logOnboardingQa("verification qa cycle started — confirmation email sent once", {
    userId: args.userId,
    cycleId,
  });

  return {
    cycleId,
    emailSent: true,
    alreadySent: false,
    emailConfirmed: false,
    status: "pending",
    message: "Check your URI email. We sent a fresh verification link for this QA cycle.",
  };
}

/**
 * Refresh cycle view from Auth. Marks the cycle completed when Auth confirms email.
 * Does not mutate profile tables.
 */
export async function refreshVerificationQaCycleView(args: {
  userId: string;
  authenticatedEmail: string;
  adminOps: AdminUserOps;
}): Promise<VerificationQaCycleView> {
  const email = assertVerificationQaCaller({ authenticatedEmail: args.authenticatedEmail });
  let user = await args.adminOps.getUserById(args.userId);
  if (normalizeVerificationQaEmail(user.email) !== email) {
    throw new ApiError(
      403,
      "Verification QA cycles are limited to the designated internal QA account.",
      "VERIFICATION_QA_FORBIDDEN",
    );
  }

  const cycle = parseVerificationQaCycleMeta(user.app_metadata);
  if (cycle?.status === "pending" && hasConfirmedEmail(user)) {
    const completed: VerificationQaCycleMeta = { ...cycle, status: "completed" };
    user = await args.adminOps.updateUserById(args.userId, {
      app_metadata: mergeVerificationQaAppMetadata(user.app_metadata as AppMetadata, completed),
    });
    logOnboardingQa("verification qa cycle completed after authoritative confirm", {
      userId: args.userId,
      cycleId: cycle.cycleId,
    });
  }

  return buildVerificationQaCycleView(user);
}

/** Lookup helper for login/signup auto-confirm guards. */
export async function userHasPendingVerificationQaCycle(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return false;
    if (!canInvokeVerificationQaCycle(data.user.email)) return false;
    return shouldSkipAutoConfirmForVerificationQa(data.user.app_metadata);
  } catch {
    return false;
  }
}
