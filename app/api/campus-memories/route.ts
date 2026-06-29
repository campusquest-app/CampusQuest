import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import {
  createCampusMemory,
  fetchCampusMemoriesByLocation,
  fetchSavedCampusMemoriesForUser,
} from "@/lib/server/campusMemories";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { createCampusMemorySchema, readJson, uuidSchema } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import { isCampusLocationKey } from "@/lib/campusLocations";

/** GET — active Memories for a location, or saved Memories for profile. */
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
    const saved = searchParams.get("saved") === "true";
    const userId = searchParams.get("userId")?.trim();

    if (saved) {
      const targetId = userId && uuidSchema.safeParse(userId).success ? userId : auth.user.id;
      const memories = await fetchSavedCampusMemoriesForUser({
        userClient: auth.userClient,
        userId: targetId,
      });
      return ok({ memories });
    }

    const locationKey = searchParams.get("locationKey")?.trim() ?? "";
    if (!locationKey || !isCampusLocationKey(locationKey)) {
      return ok({ memories: [] });
    }

    const memories = await fetchCampusMemoriesByLocation({
      userClient: auth.userClient,
      locationKey,
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
      locationKey: input.locationKey,
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
