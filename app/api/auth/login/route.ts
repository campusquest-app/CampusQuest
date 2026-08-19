import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import {
  SIGNIN_USER_MESSAGES,
  classifySupabaseSignInFailure,
  isExplicitEmailNotConfirmedError,
  type ClassifiedSignInFailure,
} from "@/lib/authSignInErrors";
import { ApiError, fail, ok } from "@/lib/server/http";
import { confirmEmailAndSignIn, findAuthUserIdByEmail, logAuthError, logAuthFlow } from "@/lib/server/authBootstrap";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { resetQaOnboardingOnLoginIfTestUser } from "@/lib/server/qaTestAccount";
import { isOnboardingQaEmail, logOnboardingQa } from "@/lib/onboardingQa";
import { canEnterAuthenticatedApp, hasConfirmedEmail } from "@/lib/authAccess";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";
import { tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
import { touchUserActivityById } from "@/lib/server/userActivity";
import { authLoginSchema, readJson } from "@/lib/server/validation";

function loginFail(failure: ClassifiedSignInFailure, debug?: Record<string, unknown>) {
  const logFailure = failure.status >= 500 ? logAuthError : logAuthFlow;
  logFailure("login", "failed", {
    status: failure.status,
    code: failure.code,
    // Sanitized user-facing message only — never passwords/tokens.
    message: failure.message,
    ...debug,
  });
  return NextResponse.json(
    { error: { message: failure.message, code: failure.code } },
    { status: failure.status },
  );
}

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authLoginSchema);
    const supabase = createPublicClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    logAuthFlow("login", "auth_sign_in", {
      ok: !error && Boolean(data.user?.id) && Boolean(data.session),
      userId: data.user?.id ?? null,
      hasSession: Boolean(data.session),
      emailConfirmed: Boolean(data.user?.email_confirmed_at ?? data.user?.confirmed_at),
      error: error?.message ?? null,
      code: error?.code ?? null,
      status: error?.status ?? null,
    });

    let authUser = data.user;
    let authSession = data.session;

    if (error && (!authUser || !authSession)) {
      const failure = classifySupabaseSignInFailure(error);
      const isUnconfirmed = isExplicitEmailNotConfirmedError({
        code: error.code,
        message: error.message,
      });

      // Auto-confirm recovery only when the flag is off AND Supabase explicitly
      // reported email_not_confirmed (never for invalid_credentials).
      if (isUnconfirmed && !FEATURE_FLAGS.requireEmailVerification) {
        const userId = await findAuthUserIdByEmail(input.email);
        if (userId) {
          const recovered = await confirmEmailAndSignIn({
            publicClient: supabase,
            userId,
            email: input.email,
            password: input.password,
            route: "login",
          });
          if (recovered.ok) {
            authUser = recovered.user;
            authSession = recovered.session;
          } else if (recovered.signInError) {
            return loginFail(classifySupabaseSignInFailure(recovered.signInError), {
              userId,
              hasSession: false,
              recoveryAttempted: true,
            });
          } else {
            return loginFail(failure, {
              userId,
              hasSession: false,
              recoveryAttempted: true,
            });
          }
        }
      }

      if (!authUser || !authSession) {
        return loginFail(failure, {
          userId: authUser?.id ?? null,
          hasSession: Boolean(authSession),
        });
      }
    }

    if (!authUser || !authSession) {
      return loginFail(
        {
          status: 401,
          message: SIGNIN_USER_MESSAGES.invalidCredentials,
          code: "INVALID_CREDENTIALS",
        },
        {
          userId: authUser?.id ?? null,
          hasSession: Boolean(authSession),
          reason: "missing_session_without_auth_error",
        },
      );
    }

    const emailConfirmed = hasConfirmedEmail(authUser);
    if (!canEnterAuthenticatedApp({ emailConfirmed })) {
      return loginFail(
        {
          status: 401,
          message: SIGNIN_USER_MESSAGES.emailNotConfirmed,
          code: "EMAIL_NOT_CONFIRMED",
        },
        {
          userId: authUser.id,
          hasSession: Boolean(authSession),
          emailConfirmed: false,
        },
      );
    }

    let player;
    const setupStarted = Date.now();
    try {
      player = await ensurePlayerSetup({
        userId: authUser.id,
        email: authUser.email,
        displayName: (authUser.user_metadata?.display_name as string | undefined) ?? undefined,
      });
      logAuthFlow("login", "profile_setup", {
        userId: authUser.id,
        profileId: player.profile.id,
        username: player.profile.username,
        elapsedMs: Date.now() - setupStarted,
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        logAuthFlow("login", "profile_setup_failed", {
          userId: authUser.id,
          code: setupError.code ?? null,
          message: setupError.message,
          elapsedMs: Date.now() - setupStarted,
        });
        return fail(setupError);
      }
      throw setupError;
    }

    let torchBearer: Awaited<ReturnType<typeof tryAwardTorchBearerBadge>> = null;
    const qaOnboardingReset = await resetQaOnboardingOnLoginIfTestUser({
      ...player.profile,
      email: authUser.email,
    });
    if (qaOnboardingReset) {
      const { data: freshProfile } = await createAdminClient()
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();
      if (freshProfile) {
        player = { ...player, profile: freshProfile as typeof player.profile };
      }
      logAuthFlow("login", "qa_onboarding_reset", { userId: authUser.id });
    } else {
      torchBearer = await tryAwardTorchBearerBadge({
        userId: authUser.id,
        user: authUser,
        email: authUser.email,
      });
      touchUserActivityById(authUser.id, { force: true });
    }

    logAuthFlow("login", "success", {
      userId: authUser.id,
      profileId: player.profile.id,
    });

    const onboardingQaReplay = isOnboardingQaEmail(authUser.email);
    if (onboardingQaReplay) {
      logOnboardingQa("login session eligible for replay", { userId: authUser.id });
    }

    return ok({
      user: {
        id: authUser.id,
        email: authUser.email,
      },
      session: authSession,
      profile: player.profile,
      stats: player.stats,
      torchBearer,
      onboardingQaReplay,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    if (error instanceof ApiError) {
      return fail(error);
    }
    return loginFail(classifySupabaseSignInFailure(error));
  }
}
