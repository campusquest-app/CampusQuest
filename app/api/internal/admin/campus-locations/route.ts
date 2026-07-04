import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import {
  createCampusLocation,
  ensureLocationExistsFromMarker,
  getCampusLocations,
  updateCampusLocation,
} from "@/lib/server/campusLocationsDb";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createCampusLocationSchema, readJson, updateCampusLocationSchema } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);
    const locations = await getCampusLocations({ includeInactive: true, refreshCache: true });
    return ok({ locations });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:campus-locations:create", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, createCampusLocationSchema);

    const row =
      input.fromMarker != null
        ? await ensureLocationExistsFromMarker({
            name: input.name,
            mapX: input.fromMarker.mapX,
            mapY: input.fromMarker.mapY,
            latitude: input.fromMarker.latitude,
            longitude: input.fromMarker.longitude,
            createdBy: auth.user.id,
            slug: input.slug,
          })
        : await createCampusLocation({
            name: input.name,
            description: input.description,
            category: input.category,
            latitude: input.latitude,
            longitude: input.longitude,
            mapX: input.mapX,
            mapY: input.mapY,
            markerEmoji: input.markerEmoji,
            shortLabel: input.shortLabel,
            fantasyName: input.fantasyName,
            flavorText: input.flavorText,
            major: input.major,
            createdBy: auth.user.id,
            slug: input.slug,
          });

    return ok({ location: row }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUser(request);
    const input = await readJson(request, updateCampusLocationSchema);
    const row = await updateCampusLocation({ slug: input.slug, patch: input.patch });
    return ok({ location: row });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
