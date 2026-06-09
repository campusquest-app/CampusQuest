import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { logQuadPostError, normalizeQuadPostProofUrl } from "@/lib/server/quadPosts";
import { requireAuthUser } from "@/lib/server/supabase";
import { quadPostProofUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

/** POST — upload a proof image (data URL) to storage; returns public https URL for post create. */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "quad:posts:proof",
      limit: 20,
      windowMs: 60_000,
    });

    const input = await readJson(request, quadPostProofUploadSchema);
    const proofUrl = await normalizeQuadPostProofUrl(input.proofDataUrl, auth.user.id);
    if (!proofUrl) {
      throw new ApiError(400, "Proof image upload produced no URL.", "PROOF_UPLOAD_EMPTY");
    }

    console.info("[cq][quad-post] proof uploaded", {
      userId: auth.user.id,
      proofUrlLength: proofUrl.length,
      isStorageUrl: proofUrl.includes("/storage/v1/object/public/quad-post-images/"),
    });

    return ok({ proofUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      const message = formatZodError(error);
      logQuadPostError("proof_validate", error, { issues: message });
      return fail(new ApiError(400, message, "VALIDATION_ERROR"));
    }
    if (!(error instanceof ApiError)) {
      logQuadPostError("proof_unhandled", error);
    }
    return fail(error);
  }
}
