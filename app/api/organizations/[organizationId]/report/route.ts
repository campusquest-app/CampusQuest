import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { reportOrganization } from "@/lib/server/campusModeration";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, reportCampusContentSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { organizationId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:report", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, reportCampusContentSchema);
    const report = await reportOrganization({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      organizationId: context.params.organizationId,
      reason: input.reason,
      details: input.details,
    });
    return ok({ report }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
