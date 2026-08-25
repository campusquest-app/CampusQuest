/**
 * Repeatable email-verification QA for the dedicated onboarding QA account.
 *
 * Architecture:
 * - Supabase Auth = authoritative verified state (`email_confirmed_at`)
 * - CampusQuest backend = starts cycle + verifies a real Auth email was dispatched
 * - Resend = delivery via Supabase Auth SMTP (existing integration; no client keys)
 * - /auth/callback = validates the real link and issues a session
 *
 * Important (reproduced against live GoTrue on 2026-08-24):
 * - `admin.updateUserById({ email_confirm: false })` returns 200 but does NOT clear
 *   `email_confirmed_at` on this project — unconfirm is a no-op.
 * - `auth.resend({ type: "signup" })` for an already-confirmed user returns
 *   `{ error: null, data: { user: null, session: null } }` WITHOUT sending mail
 *   (`confirmation_sent_at` does not advance). Treating null error as "sent" was
 *   the false-success bug.
 * - For confirmed QA accounts, Supabase-supported delivery that still hits
 *   Auth → Resend → inbox → /auth/callback is `signInWithOtp` (magic link).
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
  isAuthEmailRateLimitError,
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

export type QaEmailDispatchMethod = "signup_resend" | "magiclink_otp";

export type QaEmailDispatchResult = {
  dispatched: true;
  method: QaEmailDispatchMethod;
};

/** Caller must be authenticated as the allowlisted email — never accept a target email/userId from the client for unverifying. */
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
  /** How Supabase accepted the send (only when emailSent). */
  dispatchMethod?: QaEmailDispatchMethod;
};

export type AdminUserOps = {
  getUserById: (userId: string) => Promise<User>;
  updateUserById: (
    userId: string,
    attributes: { email_confirm?: boolean; app_metadata?: AppMetadata },
  ) => Promise<User>;
};

export type SendConfirmationEmail = (email: string) => Promise<void>;
export type DispatchQaVerificationEmail = (args: {
  email: string;
  userId: string;
  adminOps: AdminUserOps;
}) => Promise<QaEmailDispatchResult>;

function logVerificationQa(phase: string, details?: Record<string, unknown>): void {
  logOnboardingQa(phase, details);
  logEmailVerification(phase, details);
}

export function authTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** True when Auth records a newer outbound email timestamp after a send attempt. */
export function didAuthEmailTimestampAdvance(args: {
  before: string | null | undefined;
  after: string | null | undefined;
}): boolean {
  const beforeMs = authTimestampMs(args.before);
  const afterMs = authTimestampMs(args.after);
  if (afterMs == null) return false;
  if (beforeMs == null) return true;
  return afterMs > beforeMs;
}

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

function throwProviderError(error: { message?: string; code?: string; status?: number }, action: "resend" | "reset") {
  if (isAuthEmailRateLimitError(error)) {
    throw new ApiError(
      429,
      "Supabase rate-limited this QA email. Wait about a minute, then try Send test verification email again.",
      "EMAIL_RATE_LIMIT",
    );
  }
  throw classifyAuthEmailProviderError(error, action);
}

/**
 * Legacy signup-only resend. Prefer `dispatchQaVerificationEmail`, which detects
 * confirmed-account no-ops instead of treating `{ error: null }` as delivery.
 */
export async function sendConfirmationViaSupabaseResend(email: string): Promise<void> {
  const supabase = createPublicClient();
  logVerificationQa("verification qa supabase resend attempted", { type: "signup" });
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthEmailRedirectUrl() },
  });
  if (error) {
    logVerificationQa("verification qa resend provider error", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
    throwProviderError(error, "resend");
  }
  logVerificationQa("verification qa resend API returned null error (not proof of delivery)", {});
}

/**
 * Dispatch a real Supabase Auth email for the QA account.
 *
 * 1. Try Admin unconfirm + `auth.resend({ type: "signup" })` (production confirmation path).
 * 2. Prove delivery via `confirmation_sent_at` advancing — null error alone is insufficient.
 * 3. If the account stays confirmed (Admin unconfirm no-op on this GoTrue), use
 *    `signInWithOtp` (magic link) — still Auth → Resend → inbox → /auth/callback.
 */
export async function dispatchQaVerificationEmail(args: {
  email: string;
  userId: string;
  adminOps: AdminUserOps;
}): Promise<QaEmailDispatchResult> {
  const email = normalizeVerificationQaEmail(args.email);
  const redirectTo = getAuthEmailRedirectUrl();
  const supabase = createPublicClient();

  let user = await args.adminOps.getUserById(args.userId);
  const confirmedBefore = hasConfirmedEmail(user);
  logVerificationQa("verification qa dispatch starting", {
    userId: args.userId,
    authorizedAccountConfirmed: confirmedBefore,
  });

  if (confirmedBefore) {
    logVerificationQa("verification qa attempting admin unconfirm", { userId: args.userId });
    user = await args.adminOps.updateUserById(args.userId, { email_confirm: false });
    // Re-read — update response can lie about email_confirmed_at being cleared.
    user = await args.adminOps.getUserById(args.userId);
    logVerificationQa("verification qa unconfirm result", {
      userId: args.userId,
      stillConfirmed: hasConfirmedEmail(user),
      emailConfirmedAtPresent: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    });
  }

  if (!hasConfirmedEmail(user)) {
    const confirmationBefore = user.confirmation_sent_at ?? null;
    logVerificationQa("verification qa supabase resend call attempted", {
      type: "signup",
      userId: args.userId,
    });
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      logVerificationQa("verification qa supabase resend error", {
        code: error.code ?? null,
        status: error.status ?? null,
      });
      throwProviderError(error, "resend");
    }

    const after = await args.adminOps.getUserById(args.userId);
    const advanced = didAuthEmailTimestampAdvance({
      before: confirmationBefore,
      after: after.confirmation_sent_at,
    });
    logVerificationQa("verification qa signup resend post-check", {
      userId: args.userId,
      confirmationSentAtAdvanced: advanced,
      considersEmailSent: advanced,
    });
    if (!advanced) {
      throw new ApiError(
        409,
        "Supabase accepted the signup resend call but did not dispatch a confirmation email (already confirmed / no-op). Try again, or contact an admin if this persists.",
        "VERIFICATION_QA_SIGNUP_RESEND_NOOP",
      );
    }
    return { dispatched: true, method: "signup_resend" };
  }

  // Confirmed account: signup resend is a silent no-op. Use magic-link OTP instead.
  const recoveryBefore = user.recovery_sent_at ?? null;
  logVerificationQa("verification qa falling back to magiclink OTP for confirmed account", {
    userId: args.userId,
  });
  logVerificationQa("verification qa supabase OTP call attempted", {
    type: "magiclink",
    userId: args.userId,
  });
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (otpError) {
    logVerificationQa("verification qa supabase OTP error", {
      code: otpError.code ?? null,
      status: otpError.status ?? null,
    });
    throwProviderError(otpError, "resend");
  }

  const afterOtp = await args.adminOps.getUserById(args.userId);
  const recoveryAdvanced = didAuthEmailTimestampAdvance({
    before: recoveryBefore,
    after: afterOtp.recovery_sent_at,
  });
  logVerificationQa("verification qa magiclink OTP post-check", {
    userId: args.userId,
    recoverySentAtAdvanced: recoveryAdvanced,
    considersEmailSent: recoveryAdvanced,
  });
  if (!recoveryAdvanced) {
    throw new ApiError(
      409,
      "Supabase did not dispatch a QA test email (no Auth send timestamp advanced). Wait a minute for rate limits, then try again.",
      "VERIFICATION_QA_EMAIL_NOT_DISPATCHED",
    );
  }
  return { dispatched: true, method: "magiclink_otp" };
}

/**
 * Start (or idempotently resume) a verification QA cycle.
 * Resets only QA cycle metadata — never profile/XP/admin/posts.
 * Does not permanently weaken verification: Admin unconfirm is attempted only
 * to enable signup confirmation emails; when GoTrue ignores it, magic-link OTP
 * is used and the account stays confirmed.
 */
export async function startVerificationQaCycle(args: {
  userId: string;
  authenticatedEmail: string;
  requestedCycleId?: string | null;
  adminOps: AdminUserOps;
  /** @deprecated Prefer dispatchQaVerificationEmail — kept for unit tests that inject a void send. */
  sendConfirmationEmail?: SendConfirmationEmail;
  dispatchQaVerificationEmail?: DispatchQaVerificationEmail;
  now?: Date;
  newCycleId?: () => string;
}): Promise<VerificationQaStartResult> {
  const email = assertVerificationQaCaller({ authenticatedEmail: args.authenticatedEmail });
  const nowIso = (args.now ?? new Date()).toISOString();

  logVerificationQa("verification qa cycle request received", {
    userId: args.userId,
    forceNewPath: !args.requestedCycleId,
  });

  const user = await args.adminOps.getUserById(args.userId);
  if (normalizeVerificationQaEmail(user.email) !== email) {
    throw new ApiError(
      403,
      "Verification QA cycles are limited to the designated internal QA account.",
      "VERIFICATION_QA_FORBIDDEN",
    );
  }

  logVerificationQa("verification qa authorized account confirmed", {
    userId: args.userId,
    emailConfirmed: hasConfirmedEmail(user),
  });

  const existing = parseVerificationQaCycleMeta(user.app_metadata);
  if (
    shouldReusePendingCycleEmail({
      cycle: existing,
      requestedCycleId: args.requestedCycleId,
    })
  ) {
    logVerificationQa("verification qa cycle email already sent — idempotent skip", {
      userId: args.userId,
      cycleId: existing!.cycleId,
      considersEmailSent: false,
    });
    return {
      cycleId: existing!.cycleId,
      emailSent: false,
      alreadySent: true,
      emailConfirmed: hasConfirmedEmail(user),
      status: "pending",
      message: "A verification message was already sent for this QA cycle. Open the newest email, or start a new cycle.",
    };
  }

  const cycleId = (args.newCycleId ?? randomUUID)();
  const pending = buildPendingCycleMeta({ cycleId, startedAt: nowIso, initialEmailSentAt: null });
  const appMetadata = mergeVerificationQaAppMetadata(user.app_metadata as AppMetadata, pending);

  await args.adminOps.updateUserById(args.userId, {
    app_metadata: appMetadata,
  });

  let dispatchMethod: QaEmailDispatchMethod | undefined;
  try {
    if (args.dispatchQaVerificationEmail) {
      const dispatched = await args.dispatchQaVerificationEmail({
        email,
        userId: args.userId,
        adminOps: args.adminOps,
      });
      dispatchMethod = dispatched.method;
    } else if (args.sendConfirmationEmail) {
      // Test / legacy inject: caller is responsible for real delivery semantics.
      await args.sendConfirmationEmail(email);
      dispatchMethod = "signup_resend";
    } else {
      const dispatched = await dispatchQaVerificationEmail({
        email,
        userId: args.userId,
        adminOps: args.adminOps,
      });
      dispatchMethod = dispatched.method;
    }
  } catch (error) {
    logVerificationQa("verification qa send failed — not marking email sent", {
      userId: args.userId,
      cycleId,
      code: error instanceof ApiError ? error.code : null,
    });
    throw error;
  }

  const sentMeta = buildPendingCycleMeta({
    cycleId,
    startedAt: nowIso,
    initialEmailSentAt: nowIso,
  });
  const afterUser = await args.adminOps.updateUserById(args.userId, {
    app_metadata: mergeVerificationQaAppMetadata(appMetadata, sentMeta),
  });

  logVerificationQa("verification qa cycle started — email dispatch confirmed", {
    userId: args.userId,
    cycleId,
    dispatchMethod,
    considersEmailSent: true,
  });

  const message =
    dispatchMethod === "magiclink_otp"
      ? "Test email sent via Supabase magic link (account stays verified). Open the newest email to exercise /auth/callback."
      : "Test email sent. Open the newest email to test the verification link.";

  return {
    cycleId,
    emailSent: true,
    alreadySent: false,
    emailConfirmed: hasConfirmedEmail(afterUser),
    status: "pending",
    message,
    dispatchMethod,
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
    logVerificationQa("verification qa cycle completed after authoritative confirm", {
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
