import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createOrganizationEventManaged } from "@/lib/server/organizationManagement";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { organizationEventCreateSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:admin:events:create", limit: 25, windowMs: 60_000 });
    const input = await readJson(request, organizationEventCreateSchema);
    const event = await createOrganizationEventManaged({
      userClient: auth.userClient as any,
      organizationId: context.params.organizationId,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      input,
    });
    return ok({ event }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
