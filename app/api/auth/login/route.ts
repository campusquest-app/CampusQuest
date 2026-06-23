import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { ApiError, fail, ok } from "@/lib/server/http";
import { confirmEmailAndSignIn, findAuthUserIdByEmail, logAuthFlow } from "@/lib/server/authBootstrap";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
import { touchUserActivityById } from "@/lib/server/userActivity";
import { authLoginSchema, readJson } from "@/lib/server/validation";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

type SafeLoginFailure = {
  status: number;
  message: string;
};

function classifyLoginFailure(error: unknown): SafeLoginFailure {
  const rawMessage =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const rawCode =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = rawMessage.toLowerCase();
  const code = rawCode.toLowerCase();

  if (
    code.includes("fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("getaddrinfo") ||
    message.includes("enotfound") ||
    message.includes("failed to fetch")
  ) {
    return {
      status: 503,
      message: "Unable to connect. Please try again.",
    };
  }

  if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
    return {
      status: 401,
      message: "Please confirm your email before signing in.",
    };
  }

  return {
    status: 401,
    message: GENERIC_LOGIN_ERROR,
  };
}

function loginFail(failure: SafeLoginFailure, debug?: Record<string, unknown>) {
  logAuthFlow("login", "failed", {
    status: failure.status,
    message: failure.message,
    ...debug,
  });
  return NextResponse.json({ error: failure.message }, { status: failure.status });
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
    });

    let authUser = data.user;
    let authSession = data.session;

    if ((error || !authUser || !authSession) && error) {
      const failure = classifyLoginFailure(error);
      const isUnconfirmed =
        failure.message.toLowerCase().includes("confirm your email") ||
        String(error.code ?? "").toLowerCase().includes("email_not_confirmed");

      if (isUnconfirmed) {
        const userId = await findAuthUserIdByEmail(input.email);
        if (userId) {
          const recovered = await confirmEmailAndSignIn({
            publicClient: supabase,
            userId,
            email: input.email,
            password: input.password,
            route: "login",
          });
          if (recovered) {
            authUser = recovered.user;
            authSession = recovered.session;
          }
        }
      }
    }

    if (!authUser || !authSession) {
      return loginFail(classifyLoginFailure(error), {
        userId: authUser?.id ?? data.user?.id ?? null,
        hasSession: Boolean(authSession),
      });
    }

    let player;
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
      });
    } catch (setupError) {
      if (setupError instanceof ApiError) {
        logAuthFlow("login", "profile_setup_failed", {
          userId: authUser.id,
          code: setupError.code ?? null,
          message: setupError.message,
        });
        return fail(setupError);
      }
      throw setupError;
    }

    const torchBearer = await tryAwardTorchBearerBadge({
      userId: authUser.id,
      user: authUser,
      email: authUser.email,
    });

    touchUserActivityById(authUser.id, { force: true });

    logAuthFlow("login", "success", {
      userId: authUser.id,
      profileId: player.profile.id,
    });

    return ok({
      user: {
        id: authUser.id,
        email: authUser.email,
      },
      session: authSession,
      profile: player.profile,
      stats: player.stats,
      torchBearer,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    if (error instanceof ApiError) {
      return fail(error);
    }
    return loginFail(classifyLoginFailure(error));
  }
}
