import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { ApiError, fail, ok } from "@/lib/server/http";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";
import { createPublicClient } from "@/lib/server/supabase";
import { authLoginSchema, readJson } from "@/lib/server/validation";

type SafeLoginFailure = {
  status: number;
  code: string;
  message: string;
};

type LoginDebug = {
  supabase_url_present: boolean;
  supabase_url_hostname: string | null;
  supabase_anon_key_present: boolean;
  supabase_auth_error_message: string | null;
  supabase_auth_error_code: string | null;
  fetch_network_error_message: string | null;
};

function getSupabaseHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function buildLoginDebug(error: unknown): LoginDebug {
  const rawMessage =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const rawCode =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = rawMessage.toLowerCase();
  const code = rawCode.toLowerCase();
  const isFetchLikeError =
    code.includes("fetch") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("getaddrinfo") ||
    message.includes("enotfound");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    supabase_url_present: Boolean(supabaseUrl),
    supabase_url_hostname: getSupabaseHostname(supabaseUrl),
    supabase_anon_key_present: Boolean(supabaseAnonKey),
    supabase_auth_error_message: rawMessage || null,
    supabase_auth_error_code: rawCode || null,
    fetch_network_error_message: isFetchLikeError ? rawMessage || "Fetch/network failure detected." : null,
  };
}

function devFail(failure: SafeLoginFailure, error: unknown) {
  return NextResponse.json(
    {
      error: {
        message: failure.message,
        code: failure.code,
      },
      debug: buildLoginDebug(error),
    },
    { status: failure.status },
  );
}

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
      status: 502,
      code: "SUPABASE_FETCH_FAILED",
      message: "Supabase auth request failed. Check network, Supabase URL, and DNS resolution.",
    };
  }

  if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
    return {
      status: 401,
      code: "EMAIL_NOT_CONFIRMED",
      message: "Email is not confirmed.",
    };
  }

  if (code.includes("user_not_found") || message.includes("user not found")) {
    return {
      status: 401,
      code: "USER_NOT_FOUND",
      message: "User not found.",
    };
  }

  if (code.includes("invalid_credentials") || message.includes("invalid login credentials")) {
    return {
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid login credentials.",
    };
  }

  return {
    status: 401,
    code: "LOGIN_FAILED",
    message: "Login failed.",
  };
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV !== "production";

  try {
    const input = await readJson(request, authLoginSchema);
    const supabase = createPublicClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user || !data.session) {
      const failure = classifyLoginFailure(error);
      if (isDev) {
        return devFail(failure, error);
      }
      throw new ApiError(failure.status, "Login failed.", "LOGIN_FAILED");
    }

    const player = await ensurePlayerSetup({
      userId: data.user.id,
      email: data.user.email,
      displayName: (data.user.user_metadata?.display_name as string | undefined) ?? undefined,
    });

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
    if (!(error instanceof ApiError)) {
      const failure = classifyLoginFailure(error);
      if (isDev) {
        return devFail(failure, error);
      }
      return fail(new ApiError(failure.status, "Login failed.", "LOGIN_FAILED"));
    }
    return fail(error);
  }
}

