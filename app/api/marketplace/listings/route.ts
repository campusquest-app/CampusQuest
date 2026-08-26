import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createMarketplaceListing, listMarketplaceListings } from "@/lib/server/marketplace";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createMarketplaceListingSchema, marketplaceFeedQuerySchema } from "@/lib/marketplace/schemas";
import { readJson } from "@/lib/server/validation";
import { isMarketplaceFeedFilter } from "@/lib/marketplace/policy";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:listings:get", limit: 90, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const parsed = marketplaceFeedQuerySchema.safeParse({
      filter: searchParams.get("filter") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      businessId: searchParams.get("businessId") ?? undefined,
      mine: searchParams.get("mine") ?? undefined,
      campusFeed: searchParams.get("campusFeed") ?? undefined,
    });
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid query.", "VALIDATION_ERROR");
    }
    const filter = parsed.data.filter && isMarketplaceFeedFilter(parsed.data.filter) ? parsed.data.filter : undefined;
    const listings = await listMarketplaceListings({
      userClient: auth.userClient,
      userId: auth.user.id,
      filter,
      query: parsed.data.q,
      businessId: parsed.data.businessId,
      mine: Boolean(parsed.data.mine),
      campusFeed: Boolean(parsed.data.campusFeed),
    });
    return ok({ listings });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid query.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:listings:create", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, createMarketplaceListingSchema);
    const listing = await createMarketplaceListing({
      userClient: auth.userClient,
      userId: auth.user.id,
      input,
    });
    return ok({ listing }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
