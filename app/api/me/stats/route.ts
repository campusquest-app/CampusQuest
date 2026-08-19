import { fail, ok, ApiError } from "@/lib/server/http";
import { logSecurityEvent } from "@/lib/server/profileSecurity";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { ensurePlayerSetup } from "@/lib/server/playerSetup";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:stats:get", limit: 80, windowMs: 60_000 });
    const { data, error } = await auth.userClient
      .from("user_stats")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) {
      try {
        const ready = await ensurePlayerSetup({
          userId: auth.user.id,
          email: auth.user.email,
          displayName: (auth.user.user_metadata?.display_name as string | undefined) ?? undefined,
        });
        return ok(ready.stats);
      } catch (setupError) {
        if (setupError instanceof ApiError) throw setupError;
        throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");
      }
    }

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:stats:patch", limit: 30, windowMs: 60_000 });

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const attemptedFields = Object.keys(rawBody);

    console.warn("[SECURITY] Blocked XP mutation", {
      userId: auth.user.id,
      attemptedFields,
      requestPath: "/api/me/stats",
    });

    await logSecurityEvent({
      userId: auth.user.id,
      eventType: "blocked_profile_stat_mutation",
      blockedFields: attemptedFields,
      requestPath: "/api/me/stats",
      metadata: { method: "PATCH" },
    });

    throw new ApiError(
      403,
      "User stats cannot be updated directly. XP and levels are awarded through gameplay.",
      "STATS_PATCH_FORBIDDEN",
    );
  } catch (error) {
    return fail(error);
  }
}
