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

export async function POST(request: Request) {
  try {
    const missingEnv = getMissingSupabaseEnvVarNames();
    if (missingEnv.length > 0) {
      logAuthError("signup", "env_missing", { missing: missingEnv });
    }

    const input = await readJson(request, authSignupSchema);
    const clientIp = getRequestClientIp(request);
    const normalizedEmail = input.email.trim().toLowerCase();

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

    const provisioned = await provisionSignupAuthUser({
      publicClient: supabase,
      email: normalizedEmail,
      password: input.password,
      displayName: input.displayName,
    });
    const authUser = provisioned.user;

    logAuthFlow("signup", "auth_sign_up", {
      ok: true,
      userId: authUser.id,
      hasSession: Boolean(provisioned.session),
      emailConfirmed: Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at),
      source: provisioned.source,
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
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        logAuthError("signup", "profile_setup_failed", {
          userId: authUser.id,
          code: setupError.code ?? null,
          message: setupError.message,
          elapsedMs: Date.now() - setupStarted,
        });
        throw classifyProfileSetupError(setupError);
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
      if (confirmed) {
        sessionUser = confirmed.user;
        authSession = confirmed.session;
      } else {
        logAuthFlow("signup", "session_unavailable", {
          userId: authUser.id,
          reason: "email_confirmation_pending",
        });
      }
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
      });
    } else {
      logAuthError("signup", "unexpected_error", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return fail(error);
  }
}
