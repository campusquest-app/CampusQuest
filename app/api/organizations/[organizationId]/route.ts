import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { deleteOrganization, getOrganizationDetails, updateOrganization } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, updateOrganizationSchema } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:get", limit: 120, windowMs: 60_000 });
    const organization = await getOrganizationDetails({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      organizationId: context.params.organizationId,
    });
    return ok({ organization });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:update", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, updateOrganizationSchema);
    const organization = await updateOrganization({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      organizationId: context.params.organizationId,
      input,
    });
    return ok({ organization });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:delete", limit: 20, windowMs: 60_000 });
    const result = await deleteOrganization({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      organizationId: context.params.organizationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
