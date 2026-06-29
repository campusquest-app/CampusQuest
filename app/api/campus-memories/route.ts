import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import {
  createCampusMemory,
  fetchCampusMemoriesByLocation,
  fetchCampusMemoryArchive,
  fetchSavedCampusMemoriesForUser,
} from "@/lib/server/campusMemories";
import { isCampusLocationId, campusLocationIdFromLegacyKey } from "@/lib/locations/registry";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { createCampusMemorySchema, readJson, uuidSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

function resolveLocationIdParam(locationId: string, locationKey: string): string | null {
  const id = locationId.trim();
  if (id && isCampusLocationId(id)) return id;
  const key = locationKey.trim();
  if (key) return campusLocationIdFromLegacyKey(key);
  return null;
}

/** GET — active Memories for a location, saved, or archive grouped by location. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:get",
      limit: 120,
      windowMs: 60_000,
    });

    const { searchParams } = new URL(request.url);
    const archive = searchParams.get("archive") === "true";
    const saved = searchParams.get("saved") === "true";
    const userId = searchParams.get("userId")?.trim();

    if (archive) {
      const sections = await fetchCampusMemoryArchive({
        userClient: auth.userClient,
        userId: userId && uuidSchema.safeParse(userId).success ? userId : undefined,
      });
      return ok({ sections });
    }

    if (saved) {
      const targetId = userId && uuidSchema.safeParse(userId).success ? userId : auth.user.id;
      const memories = await fetchSavedCampusMemoriesForUser({
        userClient: auth.userClient,
        userId: targetId,
      });
      return ok({ memories });
    }

    const locationId = resolveLocationIdParam(
      searchParams.get("locationId") ?? "",
      searchParams.get("locationKey") ?? "",
    );
    if (!locationId) {
      return ok({ memories: [] });
    }

    const includeExpired = searchParams.get("includeExpired") === "true";
    const memories = await fetchCampusMemoriesByLocation({
      userClient: auth.userClient,
      locationId,
      includeExpired,
    });
    return ok({ memories });
  } catch (error) {
    return fail(error);
  }
}

/** POST — create a new campus Memory (24h default TTL). */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient, auth.user.id);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:create",
      limit: 30,
      windowMs: 60_000,
    });

    const input = await readJson(request, createCampusMemorySchema);
    const memory = await createCampusMemory({
      userClient: auth.userClient,
      userId: auth.user.id,
      locationId: input.locationId ?? null,
      locationKey: input.locationKey ?? null,
      locationName: input.locationName,
      eventId: input.eventId ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaType: input.mediaType,
      body: input.body ?? null,
      visibility: input.visibility,
    });

    await touchUserActivityFromAuth(auth);
    return ok({ memory }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
