import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { reconcileEventMapPlacements } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "admin:urinvolved-placement:reconcile",
      limit: 5,
      windowMs: 60_000,
    });

    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      forceGoogle?: boolean;
    };

    const result = await reconcileEventMapPlacements({
      limit: typeof body.limit === "number" ? body.limit : 80,
      forceGoogle: Boolean(body.forceGoogle),
    });

    return ok(result);
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    return fail(error);
  }
}
