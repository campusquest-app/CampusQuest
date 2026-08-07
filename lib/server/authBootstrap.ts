import type { Session, User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { isPasswordRequirementFailure } from "@/lib/passwordRequirements";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";

type PublicAuthClient = ReturnType<typeof createPublicClient>;

type AuthSupabaseError = {
  message?: string;
  code?: string;
  status?: number;
};

function authDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "1";
}

/** Names of required Supabase env vars that are missing (never returns secret values). */
export function getMissingSupabaseEnvVarNames(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

/** Dev-only auth flow logging — never logs passwords or tokens. */
export function logAuthFlow(
  route: "signup" | "login",
  phase: string,
  details: Record<string, unknown>,
): void {
  if (!authDebugEnabled()) return;
  console.info(`[auth:${route}] ${phase}`, details);
}

/** Always-on safe auth error logging for production triage — never logs passwords or tokens. */
export function logAuthError(
  route: "signup" | "login",
  phase: string,
  details: Record<string, unknown>,
): void {
  console.error(`[auth:${route}] ${phase}`, details);
}

/**
 * Supabase may create the auth user but fail sending the confirmation email
 * (rate limits, SMTP issues). Profile setup + admin confirm can still succeed.
 */
export function isRecoverableSignupAuthError(error: AuthSupabaseError): boolean {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("error sending confirmation email") ||
    (msg.includes("confirmation email") && msg.includes("error"))
  );
}

export function classifySupabaseSignupError(error: AuthSupabaseError): ApiError {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  const rawMessage = error.message ?? "Sign up failed.";

  if (isPasswordRequirementFailure(rawMessage, error.code)) {
    return new ApiError(400, "Password does not meet requirements.", "PASSWORD_REQUIREMENTS");
  }

  if (code === "over_email_send_rate_limit" || msg.includes("email rate limit") || msg.includes("rate limit exceeded")) {
    return new ApiError(
      429,
      "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
      "EMAIL_RATE_LIMIT",
    );
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already registered")
  ) {
    return new ApiError(
      409,
      "An account with this email already exists. Try signing in instead.",
      "EMAIL_ALREADY_EXISTS",
    );
  }

  if ((msg.includes("invalid") && msg.includes("email")) || code === "validation_failed") {
    return new ApiError(400, "Please enter a valid email address.", "INVALID_EMAIL");
  }

  if (code === "signup_disabled" || msg.includes("signups not allowed") || msg.includes("signup is disabled")) {
    return new ApiError(403, "New signups are temporarily disabled. Please try again later.", "SIGNUP_DISABLED");
  }

  if (msg.includes("username") || msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return new ApiError(409, "This username is already taken.", "USERNAME_TAKEN");
  }

  if (
    code.includes("fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("getaddrinfo") ||
    msg.includes("enotfound")
  ) {
    return new ApiError(
      503,
      "Unable to connect to the authentication service. Please try again.",
      "AUTH_SERVICE_UNAVAILABLE",
    );
  }

  return new ApiError(400, "Unable to create your account. Please try again.", "SIGNUP_FAILED");
}

export function classifyProfileSetupError(setupError: ApiError): ApiError {
  const msg = (setupError.message ?? "").toLowerCase();
  const code = setupError.code ?? "";

  if (msg.includes("username") || msg.includes("duplicate") || msg.includes("unique")) {
    return new ApiError(409, "This username is already taken.", "USERNAME_TAKEN");
  }

  // Transient readiness failures — surface the specific setup message (503).
  if (
    code === "AUTH_USER_NOT_READY" ||
    code === "PROFILE_SETUP_PENDING" ||
    code === "STATS_SETUP_PENDING" ||
    code === "PLAYER_SETUP_PENDING"
  ) {
    return setupError;
  }

  if (code === "PROFILE_SETUP_FAILED" && msg.includes("username")) {
    return new ApiError(409, "This username is already taken.", "USERNAME_TAKEN");
  }

  // Dev-friendly diagnostics; production clients still get a recoverable message.
  const detail =
    process.env.NODE_ENV !== "production" && setupError.message
      ? ` (${code || "SETUP_FAILED"}: ${setupError.message})`
      : "";

  return new ApiError(
    503,
    `We're still finishing your account setup. Please wait a moment and try signing in.${detail}`,
    "SIGNUP_PROFILE_SETUP_FAILED",
  );
}

/** When public signUp fails before creating a user, provision via admin API (no confirmation email). */
export function shouldFallbackToAdminSignup(error: AuthSupabaseError, hasUser: boolean): boolean {
  if (hasUser) return false;
  return isRecoverableSignupAuthError(error);
}

export async function provisionSignupAuthUser(args: {
  publicClient: PublicAuthClient;
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: User; session: Session | null; source: "sign_up" | "admin_create" }> {
  const signUpOptions = args.displayName ? { data: { display_name: args.displayName } } : undefined;

  const { data, error } = await args.publicClient.auth.signUp({
    email: args.email,
    password: args.password,
    options: signUpOptions,
  });

  const signUpUser = data.user;
  const hasUser = Boolean(signUpUser?.id);

  if (!error && hasUser) {
    return { user: signUpUser!, session: data.session, source: "sign_up" };
  }

  if (error && hasUser && isRecoverableSignupAuthError(error)) {
    return { user: signUpUser!, session: data.session, source: "sign_up" };
  }

  if (error && !shouldFallbackToAdminSignup(error, hasUser)) {
    throw classifySupabaseSignupError(error);
  }

  if (hasUser) {
    return { user: signUpUser!, session: data.session, source: "sign_up" };
  }

  logAuthFlow("signup", "admin_create_fallback", {
    code: error?.code ?? null,
    message: error?.message ?? null,
  });

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: args.displayName ? { display_name: args.displayName } : undefined,
  });

  if (createError || !created.user?.id) {
    logAuthError("signup", "admin_create_failed", {
      code: createError?.code ?? null,
      message: createError?.message ?? "missing user",
    });
    throw classifySupabaseSignupError(createError ?? { message: "Sign up failed." });
  }

  const { data: signInData, error: signInError } = await args.publicClient.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });

  if (signInError || !signInData.user) {
    logAuthError("signup", "admin_create_sign_in_failed", {
      userId: created.user.id,
      message: signInError?.message ?? "missing session",
      code: signInError?.code ?? null,
    });
    return { user: created.user, session: signInData.session ?? null, source: "admin_create" };
  }

  logAuthFlow("signup", "admin_create_ok", {
    userId: signInData.user.id,
    hasSession: Boolean(signInData.session),
  });

  return {
    user: signInData.user,
    session: signInData.session,
    source: "admin_create",
  };
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();
  let page = 1;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      logAuthFlow("login", "user_lookup_failed", { message: error.message, page });
      return null;
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match?.id) return match.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

/**
 * Supabase may require email confirmation before issuing a session.
 * When email verification is off, confirm + sign-in. If the password is wrong,
 * roll confirmation back so a failed guess never leaves the account confirmed.
 */
export async function confirmEmailAndSignIn(args: {
  publicClient: PublicAuthClient;
  userId: string;
  email: string;
  password: string;
  route: "signup" | "login";
}): Promise<
  | { ok: true; user: User; session: Session }
  | { ok: false; signInError: { message?: string; code?: string; status?: number } | null }
> {
  const admin = createAdminClient();
  const { error: confirmError } = await admin.auth.admin.updateUserById(args.userId, {
    email_confirm: true,
  });
  if (confirmError) {
    logAuthFlow(args.route, "auto_confirm_failed", {
      userId: args.userId,
      message: confirmError.message,
    });
    return { ok: false, signInError: null };
  }

  const { data, error } = await args.publicClient.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });
  if (error || !data.user || !data.session) {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(args.userId, {
      email_confirm: false,
    });
    logAuthFlow(args.route, "post_confirm_sign_in_failed", {
      userId: args.userId,
      message: error?.message ?? "missing session",
      code: error?.code ?? null,
      status: error?.status ?? null,
      rolledBackConfirm: !rollbackError,
    });
    return {
      ok: false,
      signInError: error
        ? { message: error.message, code: error.code, status: error.status }
        : { message: "missing session", code: "invalid_credentials", status: 400 },
    };
  }

  logAuthFlow(args.route, "auto_confirm_sign_in_ok", {
    userId: data.user.id,
    emailConfirmed: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
    hasSession: true,
  });

  return { ok: true, user: data.user, session: data.session };
}
