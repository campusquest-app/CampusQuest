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
import { signupEmailRejectionReason } from "@/lib/signupEmailPolicy";
import { logEmailVerification } from "@/lib/authEmailDelivery";
import { maskCampusEmail } from "@/lib/campusEmailVerification";
import {
  createSupabaseCampusEmailStore,
  getCampusEmailVerificationStatus,
  sendCampusEmailVerification,
} from "@/lib/server/campusEmailVerification";
import {
  isEmailAlreadyExistsError,
  recoverExistingSignupEmail,
  SIGNUP_AUTH_CREATED_SETUP_PENDING,
  toAuthCreatedSetupPendingError,
} from "@/lib/server/signupRecovery";

type SignupVerificationDelivery = {
  state: "sent" | "already_verified" | "send_failed";
  emailMasked: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
};

async function prepareSignupVerification(args: {
  userId: string;
  email: string;
}): Promise<SignupVerificationDelivery> {
  const store = createSupabaseCampusEmailStore();
  try {
    const result = await sendCampusEmailVerification({
      userId: args.userId,
      email: args.email,
      store,
    });
    return {
      state: result.alreadyVerified ? "already_verified" : "sent",
      emailMasked: result.emailMasked,
      expiresInSeconds: result.expiresInSeconds,
      resendAvailableInSeconds: result.resendAvailableInSeconds,
    };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "EMAIL_VERIFICATION_COOLDOWN" ||
        error.code === "EMAIL_VERIFICATION_RATE_LIMIT")
    ) {
      try {
        const status = await getCampusEmailVerificationStatus({
          userId: args.userId,
          email: args.email,
          store,
        });
        if (status.hasActiveChallenge && status.dispatched) {
          return {
            state: "sent",
            emailMasked: status.emailMasked,
            expiresInSeconds: status.expiresInSeconds,
            resendAvailableInSeconds: status.resendAvailableInSeconds,
          };
        }
      } catch {
        // Fall through to the sanitized retry state below.
      }
    }
    logAuthError("signup", "campus_verification_send_failed", {
      userId: args.userId,
      code: error instanceof ApiError ? error.code ?? null : null,
      status: error instanceof ApiError ? error.status : null,
    });
    return {
      state: "send_failed",
      emailMasked: maskCampusEmail(args.email),
      expiresInSeconds: 0,
      resendAvailableInSeconds: 0,
    };
  }
}

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
      message: "Too many verification code requests. Please wait a few minutes before trying again.",
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
          const verification = await prepareSignupVerification({
            userId: recovered.user.id,
            email: recovered.user.email ?? normalizedEmail,
          });
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
              verification,
              lifecycle: verification.state === "already_verified" ? "complete" : "verification_required",
              recovered: true,
              recoverySource: recovered.source,
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
    if (!authSession) {
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
    }

    const verification = await prepareSignupVerification({
      userId: authUser.id,
      email: authUser.email ?? normalizedEmail,
    });
    logEmailVerification("signup campus verification prepared", {
      userId: authUser.id,
      state: verification.state,
    });

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
        verification,
        lifecycle: authSession ? "verification_required" : "recover_sign_in",
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
      });
    } else {
      logAuthError("signup", "unexpected_error", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return fail(error);
  }
}
