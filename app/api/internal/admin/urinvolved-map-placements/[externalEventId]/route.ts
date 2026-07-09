import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import {
  saveManualPlacementOverride,
} from "@/lib/server/externalEventMapOverrides";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson, updateExternalEventPlacementSchema } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ externalEventId: string }> };

async function loadEventFields(externalEventId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_events")
    .select("id, venue_name, location_name, address")
    .eq("id", externalEventId)
    .maybeSingle();
  if (error || !data) {
    throw new ApiError(404, "External event not found.", "EXTERNAL_EVENT_NOT_FOUND");
  }
  return {
    rawLocation:
      ((data.venue_name as string | null) ??
        (data.location_name as string | null) ??
        (data.address as string | null) ??
        "") || null,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:urinvolved-placement:update",
      limit: 60,
      windowMs: 60_000,
    });
    const { externalEventId } = await context.params;
    const input = await readJson(request, updateExternalEventPlacementSchema);
    if (input.externalEventId !== externalEventId) {
      return fail(new ApiError(400, "Event id mismatch.", "VALIDATION_ERROR"));
    }

    const fields = await loadEventFields(externalEventId);
    const override = await saveManualPlacementOverride({
      externalEventId,
      updatedBy: auth.user.id,
      realmLocationId: input.realmLocationId ?? null,
      customLat: input.customLat ?? null,
      customLng: input.customLng ?? null,
      customLabel: input.customLabel ?? null,
      matchStatus: input.matchStatus ?? "manually_adjusted",
      rawLocationText: fields.rawLocation,
      normalizedLocationText: input.normalizedLocationText ?? null,
    });

    return ok({ override });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
