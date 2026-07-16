import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { resolveAndUpsertEventMapPlacement } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";

type RouteContext = { params: Promise<{ externalEventId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:urinvolved-placement:repair",
      limit: 30,
      windowMs: 60_000,
    });
    const { externalEventId } = await context.params;
    if (!externalEventId) {
      return fail(new ApiError(400, "externalEventId is required.", "BAD_REQUEST"));
    }

    const body = (await request.json().catch(() => ({}))) as { forceGoogle?: boolean };
    const result = await resolveAndUpsertEventMapPlacement(externalEventId, {
      forceGoogle: body.forceGoogle !== false,
      revalidate: true,
    });

    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
