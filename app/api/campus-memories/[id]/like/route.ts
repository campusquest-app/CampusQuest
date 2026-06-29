import { fail, ok } from "@/lib/server/http";
import { toggleCampusMemoryLike } from "@/lib/server/campusMemoryReactions";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — toggle like on a memory. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:like",
      limit: 120,
      windowMs: 60_000,
    });

    const { id: memoryId } = await context.params;
    if (!uuidSchema.safeParse(memoryId).success) {
      return fail(new Error("Invalid memory id."));
    }

    const result = await toggleCampusMemoryLike({
      userClient: auth.userClient,
      userId: auth.user.id,
      memoryId,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
