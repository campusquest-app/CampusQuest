import { fail, ok, ApiError } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { adminAdjustUserXp } from "@/lib/server/adminXpAdjustment";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient } from "@/lib/server/supabase";
import { adminXpAdjustSchema, readJson, uuidSchema } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:users:xp:get",
      limit: 40,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) throw new ApiError(400, "Invalid user id.", "VALIDATION_ERROR");
    const targetUserId = parsed.data;

    const admin = createAdminClient();
    const [{ data: profile }, { data: stats }, { data: logs }] = await Promise.all([
      admin.from("profiles").select("id, username, display_name").eq("id", targetUserId).maybeSingle(),
      admin.from("user_stats").select("total_xp, level").eq("user_id", targetUserId).maybeSingle(),
      admin
        .from("xp_logs")
        .select("id, xp_amount, source_type, note, created_at")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (!profile) throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
    if (!stats) throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");

    return ok({
      user: profile,
      stats: {
        totalXp: Number(stats.total_xp ?? 0),
        level: Number(stats.level ?? 1),
      },
      recentXpLogs: logs ?? [],
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:users:xp:adjust",
      limit: 20,
      windowMs: 60_000,
    });

    const parsed = uuidSchema.safeParse(context.params.userId);
    if (!parsed.success) throw new ApiError(400, "Invalid user id.", "VALIDATION_ERROR");
    const input = await readJson(request, adminXpAdjustSchema);

    const result = await adminAdjustUserXp({
      adminUserId: auth.user.id,
      adminEmail: auth.normalizedEmail,
      targetUserId: parsed.data,
      amount: input.amount,
      action: input.action,
      reason: input.reason,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
