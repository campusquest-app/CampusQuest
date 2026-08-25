import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { getMarketplaceListing, updateMarketplaceListing } from "@/lib/server/marketplace";
import { patchMarketplaceListingSchema } from "@/lib/marketplace/schemas";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, uuidSchema } from "@/lib/server/validation";

async function parseListingId(context: { params: Promise<{ listingId: string }> }): Promise<string> {
  const { listingId } = await context.params;
  const parsed = uuidSchema.safeParse(listingId);
  if (!parsed.success) throw new ApiError(400, "Invalid listing id.", "INVALID_LISTING_ID");
  return parsed.data;
}

export async function GET(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:listing:get", limit: 90, windowMs: 60_000 });
    const listingId = await parseListingId(context);
    const listing = await getMarketplaceListing({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId,
    });
    return ok({ listing });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:listing:patch", limit: 40, windowMs: 60_000 });
    const listingId = await parseListingId(context);
    const input = await readJson(request, patchMarketplaceListingSchema);
    const listing = await updateMarketplaceListing({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId,
      input,
    });
    return ok({ listing });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
