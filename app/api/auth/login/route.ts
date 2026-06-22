import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { ApiError, fail, ok } from "@/lib/server/http";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
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

function loginFail(failure: SafeLoginFailure) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[auth:login] failed", { status: failure.status });
  }
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
    if (error || !data.user || !data.session) {
      return loginFail(classifyLoginFailure(error));
    }

    const player = await ensurePlayerSetup({
      userId: data.user.id,
      email: data.user.email,
      displayName: (data.user.user_metadata?.display_name as string | undefined) ?? undefined,
    });

    touchUserActivityById(data.user.id, { force: true });

    return ok({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session,
      profile: player.profile,
      stats: player.stats,
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
