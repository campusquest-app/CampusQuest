import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";

type AuthUserLite = {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
};

async function listAuthUsers(admin: ReturnType<typeof createAdminClient>, max = 500): Promise<AuthUserLite[]> {
  const perPage = 100;
  const pages = Math.max(1, Math.ceil(max / perPage));
  const users: AuthUserLite[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = (data?.users ?? []).map((user) => ({
      id: user.id,
      email: user.email ?? null,
      user_metadata: user.user_metadata ?? {},
    }));
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users.slice(0, max);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:users", limit: 20, windowMs: 60_000 });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
    const limitParam = Number(url.searchParams.get("limit") ?? 25);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 25));

    const authUsers = await listAuthUsers(admin, 500);
    const emailMap = new Map(authUsers.map((user) => [user.id, user.email]));

    const emailMatches =
      query.length > 0
        ? authUsers.filter((user) => (user.email ?? "").toLowerCase().includes(query)).map((user) => user.id)
        : [];

    const profileQuery = admin
      .from("profiles")
      .select("id, username, display_name")
      .order("updated_at", { ascending: false })
      .limit(Math.max(limit * 3, 120));

    const { data: profileRows, error: profileError } = await profileQuery;
    if (profileError) throw profileError;

    const ids = new Set<string>([...(profileRows ?? []).map((row) => row.id), ...emailMatches]);
    if (ids.size === 0) return ok({ users: [] });

    const selectedIds = Array.from(ids).slice(0, 200);
    const [{ data: profiles, error: profilesError }, { data: safetyRows, error: safetyError }] = await Promise.all([
      admin.from("profiles").select("id, username, display_name").in("id", selectedIds),
      admin.from("user_account_safety").select("user_id, status, reason, suspended_until").in("user_id", selectedIds),
    ]);
    if (profilesError) throw profilesError;
    if (safetyError) throw safetyError;

    const safetyMap = new Map((safetyRows ?? []).map((row) => [row.user_id, row]));
    const users = (profiles ?? []).map((profile) => {
      const safety = safetyMap.get(profile.id);
      return {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        email: emailMap.get(profile.id) ?? null,
        safety: {
          status: (safety?.status as "active" | "suspended" | "banned" | undefined) ?? "active",
          reason: (safety?.reason as string | null | undefined) ?? null,
          suspendedUntil: (safety?.suspended_until as string | null | undefined) ?? null,
        },
      };
    });

    const filtered =
      query.length > 0
        ? users.filter((user) =>
            [user.username, user.displayName, user.email].some((value) => (value ?? "").toLowerCase().includes(query)),
          )
        : users;

    return ok({ users: filtered.slice(0, limit) });
  } catch (error) {
    return fail(error);
  }
}
