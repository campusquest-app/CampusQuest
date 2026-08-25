import { ApiError, fail, ok } from "@/lib/server/http";
import { toggleBusinessFollow } from "@/lib/server/marketplace";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:business:follow", limit: 40, windowMs: 60_000 });
    const { businessId } = await context.params;
    const parsed = uuidSchema.safeParse(businessId);
    if (!parsed.success) throw new ApiError(400, "Invalid business id.", "INVALID_BUSINESS_ID");
    const result = await toggleBusinessFollow({
      userClient: auth.userClient,
      userId: auth.user.id,
      businessId: parsed.data,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
