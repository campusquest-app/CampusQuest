import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { followOrganization } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { followOrganizationSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:follow", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, followOrganizationSchema);
    const membership = await followOrganization({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      organizationId: context.params.organizationId,
      role: input.role,
    });
    return ok({ membership });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
