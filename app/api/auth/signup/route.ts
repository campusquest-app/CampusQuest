import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  classifyProfileSetupError,
  confirmEmailAndSignIn,
  getMissingSupabaseEnvVarNames,
  logAuthError,
  logAuthFlow,
  provisionSignupAuthUser,
} from "@/lib/server/authBootstrap";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { enforceKeyedRateLimit, getRequestClientIp } from "@/lib/server/security";
import { tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
import { authSignupSchema, readJson } from "@/lib/server/validation";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { signupEmailRejectionReason } from "@/lib/signupEmailPolicy";
import { logEmailVerification } from "@/lib/authEmailDelivery";
import {
  isEmailAlreadyExistsError,
  recoverExistingSignupEmail,
  SIGNUP_AUTH_CREATED_SETUP_PENDING,
  SIGNUP_VERIFICATION_REQUIRED,
  toAuthCreatedSetupPendingError,
} from "@/lib/server/signupRecovery";

export async function POST(request: Request) {
  try {
    const missingEnv = getMissingSupabaseEnvVarNames();
    if (missingEnv.length > 0) {
      logAuthError("signup", "env_missing", { missing: missingEnv });
    }

    const input = await readJson(request, authSignupSchema);
    const clientIp = getRequestClientIp(request);
    const normalizedEmail = input.email.trim().toLowerCase();

    const signupEmailError = signupEmailRejectionReason(normalizedEmail);
    if (signupEmailError) {
      throw new ApiError(400, signupEmailError, "SCHOOL_EMAIL_REQUIRED");
    }

    enforceKeyedRateLimit({
      key: `ip:${clientIp}`,
      routeKey: "auth:signup:ip",
      limit: 12,
      windowMs: 60 * 60_000,
      message: "Too many signup attempts from this network. Please wait a few minutes before trying again.",
      code: "SIGNUP_RATE_LIMIT",
    });
    enforceKeyedRateLimit({
      key: `email:${normalizedEmail}`,
      routeKey: "auth:signup:email",
      limit: 3,
      windowMs: 60 * 60_000,
      message: "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
      code: "EMAIL_RATE_LIMIT",
    });

    const supabase = createPublicClient();

    let provisioned;
    try {
      provisioned = await provisionSignupAuthUser({
        publicClient: supabase,
        email: normalizedEmail,
        password: input.password,
        displayName: input.displayName,
      });
    } catch (provisionError) {
      if (isEmailAlreadyExistsError(provisionError)) {
        const recovered = await recoverExistingSignupEmail({
          publicClient: supabase,
          email: normalizedEmail,
          password: input.password,
          displayName: input.displayName,
          username: input.username,
        });
        if (recovered.kind === "ready") {
          const torchBearer = await tryAwardTorchBearerBadge({
            userId: recovered.user.id,
            user: recovered.user,
            email: recovered.user.email,
          });
          return ok(
            {
              user: { id: recovered.user.id, email: recovered.user.email },
              session: recovered.session,
              profile: recovered.profile,
              stats: recovered.stats,
              torchBearer,
              lifecycle: "complete",
              recovered: true,
              recoverySource: recovered.source,
            },
            200,
          );
        }
        if (recovered.kind === "verification_required") {
          return ok(
            {
              user: { id: recovered.userId, email: recovered.email },
              session: null,
              profile: null,
              stats: null,
              torchBearer: null,
              lifecycle: "verification_required",
              recovered: true,
            },
            200,
          );
        }
        throw recovered.error;
      }
      throw provisionError;
    }

    const authUser = provisioned.user;

    logAuthFlow("signup", "auth_sign_up", {
      ok: true,
      userId: authUser.id,
      hasSession: Boolean(provisioned.session),
      emailConfirmed: Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at),
      source: provisioned.source,
      lifecycle: "auth_created",
    });

    let player;
    const setupStarted = Date.now();
    try {
      player = await ensurePlayerSetup({
        userId: authUser.id,
        email: authUser.email,
        displayName: input.displayName,
        username: input.username,
      });
      logAuthFlow("signup", "profile_setup", {
        userId: authUser.id,
        profileId: player.profile.id,
        username: player.profile.username,
        elapsedMs: Date.now() - setupStarted,
        lifecycle: "initializing",
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        logAuthError("signup", "profile_setup_failed", {
          userId: authUser.id,
          code: setupError.code ?? null,
          message: setupError.message,
          elapsedMs: Date.now() - setupStarted,
        });
        // Auth user exists — never strand Create Account. Prefer recoverable sign-in.
        const classified = classifyProfileSetupError(setupError);
        throw toAuthCreatedSetupPendingError(classified);
      }
      throw setupError;
    }

    let sessionUser = authUser;
    let authSession = provisioned.session;
    if (!authSession && !FEATURE_FLAGS.requireEmailVerification) {
      const confirmed = await confirmEmailAndSignIn({
        publicClient: supabase,
        userId: authUser.id,
        email: input.email,
        password: input.password,
        route: "signup",
      });
      if (confirmed.ok) {
        sessionUser = confirmed.user;
        authSession = confirmed.session;
      } else {
        logAuthFlow("signup", "session_unavailable", {
          userId: authUser.id,
          reason: "email_confirmation_pending",
        });
      }
    } else if (!authSession && FEATURE_FLAGS.requireEmailVerification) {
      logEmailVerification("signup awaiting confirmation email", {
        userId: authUser.id,
      });
      logAuthFlow("signup", "session_unavailable", {
        userId: authUser.id,
        reason: "email_confirmation_required",
        lifecycle: "verification_required",
      });
    }

    const torchBearer = authSession
      ? await tryAwardTorchBearerBadge({
          userId: sessionUser.id,
          user: sessionUser,
          email: sessionUser.email,
        })
      : null;

    return ok(
      {
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
        },
        session: authSession,
        profile: player.profile,
        stats: player.stats,
        torchBearer,
        lifecycle: authSession
          ? "complete"
          : FEATURE_FLAGS.requireEmailVerification
            ? "verification_required"
            : "recover_sign_in",
      },
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      const passwordIssue = error.issues.find((issue) => issue.path[0] === "password");
      if (passwordIssue?.message === "PASSWORD_REQUIREMENTS") {
        return fail(new ApiError(400, "Password does not meet requirements.", "PASSWORD_REQUIREMENTS"));
      }
      return fail(new ApiError(400, "Please check your information and try again.", "VALIDATION_ERROR"));
    }
    if (error instanceof ApiError) {
      logAuthError("signup", "api_error", {
        status: error.status,
        code: error.code ?? null,
        message: error.message,
        authCreatedPending: error.code === SIGNUP_AUTH_CREATED_SETUP_PENDING,
        verificationRequired: error.code === SIGNUP_VERIFICATION_REQUIRED,
      });
    } else {
      logAuthError("signup", "unexpected_error", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return fail(error);
  }
}
