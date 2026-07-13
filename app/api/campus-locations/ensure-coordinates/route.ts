import { ZodError, z } from "zod";
import { updateCampusLocation } from "@/lib/server/campusLocationsDb";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { campusLocationSlugSchema, readJson } from "@/lib/server/validation";

const ensureCoordinatesSchema = z.object({
  slug: campusLocationSlugSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Fill missing campus location coordinates discovered during client routing. */
export async function PATCH(request: Request) {
  try {
    await requireAuthUser(request);
    const input = await readJson(request, ensureCoordinatesSchema);
    const row = await updateCampusLocation({
      slug: input.slug,
      patch: {
        latitude: input.latitude,
        longitude: input.longitude,
      },
      onlyIfCoordinatesMissing: true,
    });
    return ok({ location: row });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
