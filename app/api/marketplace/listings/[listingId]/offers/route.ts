import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createMarketplaceOffer, listListingOffers } from "@/lib/server/marketplace";
import { createMarketplaceOfferSchema } from "@/lib/marketplace/schemas";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, uuidSchema } from "@/lib/server/validation";

async function parseListingId(context: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await context.params;
  const parsed = uuidSchema.safeParse(listingId);
  if (!parsed.success) throw new ApiError(400, "Invalid listing id.", "INVALID_LISTING_ID");
  return parsed.data;
}

export async function GET(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:offers:get", limit: 60, windowMs: 60_000 });
    const listingId = await parseListingId(context);
    const offers = await listListingOffers({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId,
    });
    return ok({ offers });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:offers:create", limit: 20, windowMs: 60_000 });
    const listingId = await parseListingId(context);
    const input = await readJson(request, createMarketplaceOfferSchema);
    const offer = await createMarketplaceOffer({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId,
      amountDollars: input.amountDollars,
    });
    return ok({ offer }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
