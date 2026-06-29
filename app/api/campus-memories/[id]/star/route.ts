import { fail, ok } from "@/lib/server/http";
import { starCampusMemory } from "@/lib/server/campusMemoryReactions";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { uuidSchema } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — star a memory (+1 XP once per user per memory). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:star",
      limit: 60,
      windowMs: 60_000,
    });

    const { id: memoryId } = await context.params;
    if (!uuidSchema.safeParse(memoryId).success) {
      return fail(new Error("Invalid memory id."));
    }

    const result = await starCampusMemory({
      userClient: auth.userClient,
      userId: auth.user.id,
      memoryId,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
