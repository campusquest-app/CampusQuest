import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { reviewProofSubmission } from "@/lib/server/services";
import { proofReviewSchema, readJson } from "@/lib/server/validation";

function assertReviewKey(request: Request) {
  const expected = process.env.PROOF_REVIEW_API_KEY;
  if (!expected) {
    throw new ApiError(500, "Missing PROOF_REVIEW_API_KEY for review route.", "PROOF_REVIEW_KEY_MISSING");
  }
  const provided = request.headers.get("x-proof-review-key");
  if (!provided || provided !== expected) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
}

export async function POST(request: Request) {
  try {
    assertReviewKey(request);
    const input = await readJson(request, proofReviewSchema);
    const result = await reviewProofSubmission({
      submissionId: input.submissionId,
      decision: input.decision,
      reviewNote: input.reviewNote,
      reviewerUserId: input.reviewerUserId,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

