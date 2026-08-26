import { ZodError } from "zod";
import { uuidSchema, readJson } from "@/lib/server/validation";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { reviewVerificationRequestSchema } from "@/lib/identity/schemas";
import { reviewVerificationRequestAdmin } from "@/lib/server/verificationRequests";
import { enforceRateLimit } from "@/lib/server/security";

export async function POST(request: Request, context: { params: { requestId: string } }) {
  try {
    const requestId = uuidSchema.parse(context.params.requestId);
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:verification-requests:review",
      limit: 30,
      windowMs: 60_000,
    });
    const input = await readJson(request, reviewVerificationRequestSchema);
    const result = await reviewVerificationRequestAdmin({
      requestId,
      reviewerUserId: auth.user.id,
      reviewerEmail: auth.user.email ?? null,
      action: input.action,
      adminInternalNotes: input.adminInternalNotes ?? null,
      applicantStatusMessage: input.applicantStatusMessage ?? null,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid review.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
