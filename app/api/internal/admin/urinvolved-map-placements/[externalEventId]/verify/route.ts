import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { markPlacementVerified } from "@/lib/server/externalEventMapOverrides";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson, verifyExternalEventPlacementSchema } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ externalEventId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:urinvolved-placement:verify",
      limit: 30,
      windowMs: 60_000,
    });
    const { externalEventId } = await context.params;
    const input = await readJson(request, verifyExternalEventPlacementSchema);
    if (input.externalEventId !== externalEventId) {
      return fail(new ApiError(400, "Event id mismatch.", "VALIDATION_ERROR"));
    }

    const override = await markPlacementVerified({
      externalEventId,
      updatedBy: auth.user.id,
      registrySlug: input.registrySlug ?? null,
    });
    return ok({ override });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
