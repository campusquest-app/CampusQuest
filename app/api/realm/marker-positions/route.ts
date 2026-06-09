import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import {
  fetchRealmMarkerPositions,
  isMissingRealmConfigTableError,
  saveRealmMarkerPositions,
} from "@/lib/server/realmMarkerPositions";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { realmMarkerPositionsPatchSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "realm:marker-positions:get", limit: 120, windowMs: 60_000 });

    const result = await fetchRealmMarkerPositions(auth.userClient);
    return ok({
      positions: result.positions,
      updatedAt: result.updatedAt,
      updatedBy: result.updatedBy,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "REALM_MARKER_POSITIONS_FETCH_FAILED") {
      const cause = error.message;
      if (isMissingRealmConfigTableError({ message: cause })) {
        return ok({ positions: {}, updatedAt: null, updatedBy: null, tableReady: false });
      }
    }
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "realm:marker-positions:patch", limit: 30, windowMs: 60_000 });

    const input = await readJson(request, realmMarkerPositionsPatchSchema);
    const saved = await saveRealmMarkerPositions({
      positions: input.positions,
      updatedBy: auth.user.id,
    });

    return ok({
      positions: saved.positions,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
