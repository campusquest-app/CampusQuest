import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createProofUpload } from "@/lib/server/services";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { proofUploadSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "proof:upload", limit: 10, windowMs: 60_000 });
    const input = await readJson(request, proofUploadSchema);
    const result = await createProofUpload({
      userClient: auth.userClient,
      userId: auth.user.id,
      extension: input.extension,
      contentType: input.contentType,
      fileSizeBytes: input.fileSizeBytes,
      questId: input.questId,
      userQuestId: input.userQuestId,
    });
    return ok(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

