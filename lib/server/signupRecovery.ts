import type { Session, User } from "@supabase/supabase-js";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { ApiError } from "@/lib/server/http";
import {
  confirmEmailAndSignIn,
  findAuthUserIdByEmail,
  logAuthError,
  logAuthFlow,
} from "@/lib/server/authBootstrap";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { userHasPendingVerificationQaCycle } from "@/lib/server/verificationQaCycle";

export const SIGNUP_AUTH_CREATED_SETUP_PENDING = "AUTH_CREATED_SETUP_PENDING" as const;
export const SIGNUP_VERIFICATION_REQUIRED = "SIGNUP_VERIFICATION_REQUIRED" as const;

export const PENDING_SETUP_USER_MESSAGE =
  "We're finishing your account setup. Please wait a moment, then try signing in.";

const PENDING_SETUP_CODES = new Set([
  "AUTH_USER_NOT_READY",
  "PROFILE_SETUP_PENDING",
  "STATS_SETUP_PENDING",
  "PLAYER_SETUP_PENDING",
  "SIGNUP_PROFILE_SETUP_FAILED",
  "AUTH_CREATED_SETUP_PENDING",
]);

export type SignupLifecycleState =
  | "idle"
  | "submitting"
  | "auth_created"
  | "verification_required"
  | "initializing"
  | "onboarding"
  | "complete"
  | "recover_sign_in"
  | "failed";

export function isPendingPlayerSetupCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return PENDING_SETUP_CODES.has(code.toUpperCase());
}

export function isEmailAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const code = (error.code ?? "").toUpperCase();
  return code === "EMAIL_ALREADY_EXISTS" || code === "EMAIL_ALREADY_REGISTERED";
}

type PublicAuthClient = ReturnType<typeof createPublicClient>;

export type SignupRecoveryResult =
  | {
      kind: "ready";
      user: User;
      session: Session;
      profile: unknown;
      stats: unknown;
      source: "existing_password_login" | "existing_auto_confirm";
    }
  | {
      kind: "verification_required";
      email: string;
      userId: string | null;
    }
  | {
      kind: "unrecoverable";
      error: ApiError;
    };

/**
 * When Create Account hits an already-registered email, attempt an idempotent
 * recovery instead of trapping the user on a doomed second signup.
 */
export async function recoverExistingSignupEmail(args: {
  publicClient: PublicAuthClient;
  email: string;
  password: string;
  displayName?: string;
  username?: string;
}): Promise<SignupRecoveryResult> {
  const email = args.email.trim().toLowerCase();

  const { data: signInData, error: signInError } = await args.publicClient.auth.signInWithPassword({
    email,
    password: args.password,
  });

  if (!signInError && signInData.user && signInData.session) {
    try {
      const player = await ensurePlayerSetup({
        userId: signInData.user.id,
        email: signInData.user.email,
        displayName: args.displayName,
        username: args.username,
      });
      logAuthFlow("signup", "existing_email_recovered_via_login", {
        userId: signInData.user.id,
      });
      return {
        kind: "ready",
        user: signInData.user,
        session: signInData.session,
        profile: player.profile,
        stats: player.stats,
        source: "existing_password_login",
      };
    } catch (setupError) {
      if (setupError instanceof ApiError && isPendingPlayerSetupCode(setupError.code)) {
        // Auth works — ask client to finish via sign-in retry path.
        throw new ApiError(503, PENDING_SETUP_USER_MESSAGE, SIGNUP_AUTH_CREATED_SETUP_PENDING);
      }
      throw setupError;
    }
  }

  const userId = await findAuthUserIdByEmail(email);

  if (!FEATURE_FLAGS.requireEmailVerification && userId) {
    if (await userHasPendingVerificationQaCycle(userId)) {
      logAuthFlow("signup", "existing_email_verification_qa_pending", { userId });
      return { kind: "verification_required", email, userId };
    }
    const recovered = await confirmEmailAndSignIn({
      publicClient: args.publicClient,
      userId,
      email,
      password: args.password,
      route: "signup",
    });
    if (recovered.ok) {
      try {
        const player = await ensurePlayerSetup({
          userId: recovered.user.id,
          email: recovered.user.email,
          displayName: args.displayName,
          username: args.username,
        });
        logAuthFlow("signup", "existing_email_recovered_via_confirm", {
          userId: recovered.user.id,
        });
        return {
          kind: "ready",
          user: recovered.user,
          session: recovered.session,
          profile: player.profile,
          stats: player.stats,
          source: "existing_auto_confirm",
        };
      } catch (setupError) {
        if (setupError instanceof ApiError && isPendingPlayerSetupCode(setupError.code)) {
          throw new ApiError(503, PENDING_SETUP_USER_MESSAGE, SIGNUP_AUTH_CREATED_SETUP_PENDING);
        }
        throw setupError;
      }
    }
  }

  if (FEATURE_FLAGS.requireEmailVerification && userId) {
    logAuthFlow("signup", "existing_email_needs_verification", { userId });
    return { kind: "verification_required", email, userId };
  }

  // Wrong password for an existing account, or lookup failed.
  logAuthError("signup", "existing_email_unrecoverable", {
    userId,
    signInCode: signInError?.code ?? null,
  });
  return {
    kind: "unrecoverable",
    error: new ApiError(
      409,
      "An account with this email already exists. Try signing in instead.",
      "EMAIL_ALREADY_EXISTS",
    ),
  };
}

/**
 * After auth.users was created, player setup failed. Prefer a recoverable
 * "auth created / finish via sign-in" outcome over stranding Create Account.
 */
export function toAuthCreatedSetupPendingError(setupError: ApiError): ApiError {
  if ((setupError.code ?? "").toUpperCase() === "USERNAME_TAKEN") return setupError;
  if (isPendingPlayerSetupCode(setupError.code)) {
    return new ApiError(503, PENDING_SETUP_USER_MESSAGE, SIGNUP_AUTH_CREATED_SETUP_PENDING);
  }
  // Permanent setup failures after auth still leave an auth user — recover via sign-in.
  return new ApiError(503, PENDING_SETUP_USER_MESSAGE, SIGNUP_AUTH_CREATED_SETUP_PENDING);
}
