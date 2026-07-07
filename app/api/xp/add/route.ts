import { fail, ApiError } from "@/lib/server/http";
import { logSecurityEvent } from "@/lib/server/profileSecurity";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as Request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "xp:add", limit: 10, windowMs: 60_000 });

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    console.warn("[SECURITY] Blocked XP mutation", {
      userId: auth.user.id,
      requestPath: "/api/xp/add",
      attemptedFields: Object.keys(rawBody),
    });

    await logSecurityEvent({
      userId: auth.user.id,
      eventType: "blocked_profile_stat_mutation",
      blockedFields: Object.keys(rawBody),
      requestPath: "/api/xp/add",
      metadata: { method: "POST" },
    });

    throw new ApiError(
      403,
      "XP cannot be granted through this endpoint. Complete quests, scan QR codes, or log activities instead.",
      "XP_SELF_GRANT_FORBIDDEN",
    );
  } catch (error) {
    return fail(error);
  }
}
