import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { reportMarketplaceListing } from "@/lib/server/marketplace";
import { reportMarketplaceListingSchema } from "@/lib/marketplace/schemas";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, uuidSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: Promise<{ listingId: string }> }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:report", limit: 10, windowMs: 60_000 });
    const { listingId } = await context.params;
    const parsed = uuidSchema.safeParse(listingId);
    if (!parsed.success) throw new ApiError(400, "Invalid listing id.", "INVALID_LISTING_ID");
    const input = await readJson(request, reportMarketplaceListingSchema);
    const report = await reportMarketplaceListing({
      userClient: auth.userClient,
      userId: auth.user.id,
      listingId: parsed.data,
      reason: input.reason,
      details: input.details,
    });
    return ok({ report }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
