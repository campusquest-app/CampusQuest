import { ApiError, fail } from "@/lib/server/http";
import { logSecurityEvent } from "@/lib/server/profileSecurity";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

/**
 * AUD-001 (J): this endpoint used to mint any catalog item in any quantity for
 * the caller. Item grants are server-authoritative — they come from boss drops,
 * quest rewards and QR rewards, which call addItemToInventory() directly — so
 * client-initiated grants are refused here, mirroring /api/xp/add.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as Request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "inventory:add", limit: 20, windowMs: 60_000 });

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    console.warn("[SECURITY] Blocked inventory grant", {
      userId: auth.user.id,
      requestPath: "/api/inventory/add",
      attemptedFields: Object.keys(rawBody),
    });

    await logSecurityEvent({
      userId: auth.user.id,
      eventType: "blocked_inventory_grant",
      blockedFields: Object.keys(rawBody),
      requestPath: "/api/inventory/add",
      metadata: { method: "POST" },
    });

    throw new ApiError(
      403,
      "Items cannot be granted through this endpoint. Defeat bosses, complete quests, or scan QR codes instead.",
      "INVENTORY_SELF_GRANT_FORBIDDEN",
    );
  } catch (error) {
    return fail(error);
  }
}
