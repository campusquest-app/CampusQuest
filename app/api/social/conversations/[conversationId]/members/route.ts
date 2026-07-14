import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { addGroupMembers } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { addGroupMembersSchema, readJson } from "@/lib/server/validation";

type RouteContext = { params: { conversationId: string } };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:conversation:members:add", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, addGroupMembersSchema);
    const conversation = await addGroupMembers({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: context.params.conversationId,
      memberIds: input.memberIds,
    });
    return ok({ conversation });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
