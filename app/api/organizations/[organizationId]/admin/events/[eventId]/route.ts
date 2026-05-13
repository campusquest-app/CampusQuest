import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { deleteOrganizationEventManaged, updateOrganizationEventManaged } from "@/lib/server/organizationManagement";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { organizationEventUpdateSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string; eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:admin:events:update", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, organizationEventUpdateSchema);
    const event = await updateOrganizationEventManaged({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      eventId: context.params.eventId,
      userId: auth.user.id,
      input,
    });
    return ok({ event });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(request: Request, context: { params: { organizationId: string; eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:admin:events:delete", limit: 25, windowMs: 60_000 });
    const result = await deleteOrganizationEventManaged({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      eventId: context.params.eventId,
      userId: auth.user.id,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
