import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:admin:audit-logs", limit: 20, windowMs: 60_000 });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 100);
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitParam) ? limitParam : 100));

    const { data, error } = await admin
      .from("admin_audit_logs")
      .select("id, admin_user_id, admin_email, action_type, target_user_id, reason, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = data ?? [];
    const targetIds = Array.from(new Set(rows.map((row) => row.target_user_id).filter(Boolean) as string[]));
    const adminIds = Array.from(new Set(rows.map((row) => row.admin_user_id).filter(Boolean) as string[]));
    const profileIds = Array.from(new Set([...targetIds, ...adminIds]));
    const { data: profiles, error: profilesError } = profileIds.length
      ? await admin.from("profiles").select("id, username, display_name").in("id", profileIds)
      : { data: [], error: null as any };
    if (profilesError) throw profilesError;

    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    const logs = rows.map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      actionType: row.action_type,
      reason: row.reason,
      metadata: row.metadata ?? {},
      admin: {
        userId: row.admin_user_id,
        email: row.admin_email,
        username: row.admin_user_id ? profileMap.get(row.admin_user_id)?.username ?? null : null,
        displayName: row.admin_user_id ? profileMap.get(row.admin_user_id)?.display_name ?? null : null,
      },
      targetUser: row.target_user_id
        ? {
            userId: row.target_user_id,
            username: profileMap.get(row.target_user_id)?.username ?? null,
            displayName: profileMap.get(row.target_user_id)?.display_name ?? null,
          }
        : null,
    }));

    return ok({ logs });
  } catch (error) {
    return fail(error);
  }
}
