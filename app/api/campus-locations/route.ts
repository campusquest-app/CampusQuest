import { ZodError } from "zod";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    await requireAuthUser(request);
    const locations = await getCampusLocations({ includeInactive: false, refreshCache: true });
    return ok({
      locations: locations.map((row) => ({
        id: row.slug,
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        latitude: row.latitude,
        longitude: row.longitude,
        mapX: row.mapX,
        mapY: row.mapY,
        markerEmoji: row.markerEmoji,
        shortLabel: row.shortLabel,
        fantasyName: row.fantasyName,
        flavorText: row.flavorText,
        major: row.major,
        legacyCampusKey: row.legacyCampusKey,
        sortOrder: row.sortOrder,
        isBuiltin: row.isBuiltin,
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid request.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
