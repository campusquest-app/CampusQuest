import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listPinnedDmUsers, pinDmUser } from "@/lib/server/pinnedDmUsers";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { pinDmUserSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:pinned-dm-users:get", limit: 60, windowMs: 60_000 });
    const pinnedUsers = await listPinnedDmUsers({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ pinnedUsers });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:pinned-dm-users:post", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, pinDmUserSchema);
    const result = await pinDmUser({
      userClient: auth.userClient,
      userId: auth.user.id,
      pinnedUserId: input.pinnedUserId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
