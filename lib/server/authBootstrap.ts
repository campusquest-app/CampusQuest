import type { Session, User } from "@supabase/supabase-js";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";

type PublicAuthClient = ReturnType<typeof createPublicClient>;

function authDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "1";
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
 * CampusQuest signup already provisions profiles server-side; confirm the auth
 * user so the same credentials work on immediate sign-in.
 */
export async function confirmEmailAndSignIn(args: {
  publicClient: PublicAuthClient;
  userId: string;
  email: string;
  password: string;
  route: "signup" | "login";
}): Promise<{ user: User; session: Session } | null> {
  const admin = createAdminClient();
  const { error: confirmError } = await admin.auth.admin.updateUserById(args.userId, {
    email_confirm: true,
  });
  if (confirmError) {
    logAuthFlow(args.route, "auto_confirm_failed", {
      userId: args.userId,
      message: confirmError.message,
    });
    return null;
  }

  const { data, error } = await args.publicClient.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });
  if (error || !data.user || !data.session) {
    logAuthFlow(args.route, "post_confirm_sign_in_failed", {
      userId: args.userId,
      message: error?.message ?? "missing session",
      code: error?.code ?? null,
    });
    return null;
  }

  logAuthFlow(args.route, "auto_confirm_sign_in_ok", {
    userId: data.user.id,
    emailConfirmed: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
    hasSession: true,
  });

  return { user: data.user, session: data.session };
}
