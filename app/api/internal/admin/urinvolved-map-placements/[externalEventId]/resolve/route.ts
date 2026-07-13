import { requireAdminUser } from "@/lib/server/adminAuth";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { resolvePlacementFromLocationName } from "@/lib/server/externalEventMapOverrides";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";

type RouteContext = { params: Promise<{ externalEventId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:urinvolved-placement:resolve",
      limit: 20,
      windowMs: 60_000,
    });
    const { externalEventId } = await context.params;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("external_events")
      .select("id, venue_name, location_name, address")
      .eq("id", externalEventId)
      .maybeSingle();
    if (error || !data) {
      return fail(new ApiError(404, "External event not found.", "EXTERNAL_EVENT_NOT_FOUND"));
    }

    const fields = {
      venueName: (data.venue_name as string | null) ?? null,
      locationName: (data.location_name as string | null) ?? null,
      address: (data.address as string | null) ?? null,
    };
    const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
      slug: row.slug,
      name: row.name,
    }));
    const override = await resolvePlacementFromLocationName({
      externalEventId,
      fields,
      catalog,
      updatedBy: auth.user.id,
    });
    return ok({ override });
  } catch (error) {
    return fail(error);
  }
}
