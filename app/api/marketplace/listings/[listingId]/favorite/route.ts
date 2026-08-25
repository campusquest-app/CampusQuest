import { ApiError, fail, ok } from "@/lib/server/http";
import { toggleMarketplaceFavorite } from "@/lib/server/marketplace";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:favorite", limit: 60, windowMs: 60_000 });
    const { listingId } = await context.params;
    const parsed = uuidSchema.safeParse(listingId);
    if (!parsed.success) throw new ApiError(400, "Invalid listing id.", "INVALID_LISTING_ID");
    const result = await toggleMarketplaceFavorite({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId: parsed.data,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
