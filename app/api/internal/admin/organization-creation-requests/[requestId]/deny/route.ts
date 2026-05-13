import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { denyOrganizationCreationRequestAdmin } from "@/lib/server/organizationCreationRequests";
import { enforceRateLimit } from "@/lib/server/security";
import { organizationCreationRequestDenySchema, readJson, uuidSchema } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { requestId: string } }) {
  try {
    const requestId = uuidSchema.parse(context.params.requestId);
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:organization-creation-requests:deny",
      limit: 30,
      windowMs: 60_000,
    });
    const json = await request.json().catch(() => ({}));
    const input = organizationCreationRequestDenySchema.parse(json);
    const result = await denyOrganizationCreationRequestAdmin({
      requestId,
      reviewerUserId: auth.user.id,
      reason: input.adminReason,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
