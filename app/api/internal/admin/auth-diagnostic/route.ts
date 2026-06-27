import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { logAuthError } from "@/lib/server/authBootstrap";

/**
 * TEMPORARY admin-only login diagnostic.
 *
 * Reports whether an auth user exists, whether its email is confirmed, and
 * whether the matching app rows (profiles + user_stats) were provisioned — to
 * triage "signed up but can't log in" reports. Admin-gated, rate limited, and
 * returns only non-sensitive metadata (no tokens, passwords, or service keys).
 *
 * NOTE on schema: CampusQuest has no `public.users` table and `public.profiles`
 * has no `email` column — email lives only in `auth.users`. App rows are keyed
 * by `auth.users.id`, so we resolve the id by email first, then look up profiles
 * and user_stats by id. Remove this route once the login issue is resolved.
 *
 *   GET /api/internal/admin/auth-diagnostic?email=claire.boulanger@uri.edu
 */

type RawAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  banned_until?: string | null;
};

async function findAuthUsersByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<RawAuthUser[]> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  const matches: RawAuthUser[] = [];

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) {
      if ((user.email ?? "").toLowerCase() === target) {
        const raw = user as unknown as Record<string, unknown>;
        matches.push({
          id: user.id,
          email: user.email ?? null,
          email_confirmed_at: (raw.email_confirmed_at as string | null | undefined) ?? null,
          confirmed_at: (raw.confirmed_at as string | null | undefined) ?? null,
          last_sign_in_at: (raw.last_sign_in_at as string | null | undefined) ?? null,
          created_at: (raw.created_at as string | null | undefined) ?? null,
          banned_until: (raw.banned_until as string | null | undefined) ?? null,
        });
      }
    }
    if (users.length < perPage) break;
  }

  return matches;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:auth-diagnostic", limit: 20, windowMs: 60_000 });

    const url = new URL(request.url);
    const emailParam = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    if (!emailParam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)) {
      throw new ApiError(400, "A valid ?email= query parameter is required.", "INVALID_EMAIL");
    }

    const admin = createAdminClient();
    const authUsers = await findAuthUsersByEmail(admin, emailParam);

    if (authUsers.length === 0) {
      return ok({
        email: emailParam,
        authUser: null,
        duplicateAuthUsers: 0,
        profile: null,
        stats: null,
        summary: "No auth user exists for this email. The account was never created (or uses a different email).",
      });
    }

    // Use the most recently created auth user if (unexpectedly) duplicated.
    const authUser =
      authUsers.length === 1
        ? authUsers[0]!
        : [...authUsers].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]!;

    const [{ data: profile, error: profileError }, { data: stats, error: statsError }] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, username, display_name, role, character_class_id, onboarding_completed, created_at, updated_at",
        )
        .eq("id", authUser.id)
        .maybeSingle(),
      admin
        .from("user_stats")
        .select("user_id, level, total_xp, created_at, updated_at")
        .eq("user_id", authUser.id)
        .maybeSingle(),
    ]);

    if (profileError) throw profileError;
    if (statsError) throw statsError;

    const emailConfirmed = Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at);
    const isBanned = Boolean(authUser.banned_until && new Date(authUser.banned_until).getTime() > Date.now());

    const issues: string[] = [];
    if (!emailConfirmed) issues.push("EMAIL_NOT_CONFIRMED");
    if (isBanned) issues.push("ACCOUNT_BANNED");
    if (!profile) issues.push("PROFILE_ROW_MISSING");
    if (!stats) issues.push("STATS_ROW_MISSING");
    if (authUsers.length > 1) issues.push("DUPLICATE_AUTH_USERS");

    const summary =
      issues.length === 0
        ? "Auth user exists, email confirmed, profile + stats present. Login should succeed; failure is likely credentials or environment."
        : `Found ${issues.length} issue(s): ${issues.join(", ")}.`;

    return ok({
      email: emailParam,
      authUser: {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed,
        emailConfirmedAt: authUser.email_confirmed_at ?? authUser.confirmed_at ?? null,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        createdAt: authUser.created_at ?? null,
        bannedUntil: authUser.banned_until ?? null,
        isBanned,
      },
      duplicateAuthUsers: authUsers.length,
      profile: profile
        ? {
            id: profile.id,
            username: profile.username,
            displayName: profile.display_name,
            role: profile.role,
            characterClassId: profile.character_class_id ?? null,
            onboardingCompleted: profile.onboarding_completed ?? null,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          }
        : null,
      stats: stats
        ? {
            userId: stats.user_id,
            level: stats.level,
            totalXp: stats.total_xp,
            createdAt: stats.created_at,
            updatedAt: stats.updated_at,
          }
        : null,
      issues,
      summary,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      logAuthError("login", "auth_diagnostic_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return fail(error);
  }
}
