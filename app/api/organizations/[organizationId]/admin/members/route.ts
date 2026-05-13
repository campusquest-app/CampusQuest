import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { removeOrganizationMember, reviewJoinRequest, updateMemberRole } from "@/lib/server/organizationManagement";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { organizationMemberModerationSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:admin:members:post", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, organizationMemberModerationSchema);
    if (input.action === "approve_join" || input.action === "deny_join") {
      if (!input.requestId) {
        throw new ApiError(400, "requestId is required.", "VALIDATION_ERROR");
      }
      const review = await reviewJoinRequest({
        userClient: auth.userClient as any,
        organizationId: context.params.organizationId,
        userId: auth.user.id,
        requestId: input.requestId,
        action: input.action === "approve_join" ? "approve" : "deny",
      });
      return ok({ review });
    }
    if (input.action === "set_role") {
      if (!input.memberUserId || !input.role) {
        throw new ApiError(400, "memberUserId and role are required.", "VALIDATION_ERROR");
      }
      const member = await updateMemberRole({
        userClient: auth.userClient as any,
        organizationId: context.params.organizationId,
        userId: auth.user.id,
        memberUserId: input.memberUserId,
        role: input.role,
      });
      return ok({ member });
    }
    if (!input.memberUserId) {
      throw new ApiError(400, "memberUserId is required.", "VALIDATION_ERROR");
    }
    const result = await removeOrganizationMember({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      userId: auth.user.id,
      memberUserId: input.memberUserId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
