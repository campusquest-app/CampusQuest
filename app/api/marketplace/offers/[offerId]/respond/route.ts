import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { respondToMarketplaceOffer } from "@/lib/server/marketplace";
import { respondMarketplaceOfferSchema } from "@/lib/marketplace/schemas";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, uuidSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:offer:respond", limit: 30, windowMs: 60_000 });
    const { offerId } = await context.params;
    const parsed = uuidSchema.safeParse(offerId);
    if (!parsed.success) throw new ApiError(400, "Invalid offer id.", "INVALID_OFFER_ID");
    const input = await readJson(request, respondMarketplaceOfferSchema);
    const result = await respondToMarketplaceOffer({
      userClient: auth.userClient,
      userId: auth.user.id,
      offerId: parsed.data,
      action: input.action,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
