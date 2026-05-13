import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { blockUser, listBlockedUsers } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { blockUserSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:blocks:get", limit: 30, windowMs: 60_000 });
    const blockedUsers = await listBlockedUsers({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ blockedUsers });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "social:blocks:post",
      limit: 8,
      windowMs: 60_000,
      message: "You're doing that too often. Please try again later.",
      code: "ABUSE_RATE_LIMITED",
    });
    const input = await readJson(request, blockUserSchema);
    const block = await blockUser({
      userClient: auth.userClient,
      userId: auth.user.id,
      blockedUserId: input.userId,
      reason: input.reason,
    });
    return ok({ block }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
