import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { normalizeCampusMemoryMediaUrl } from "@/lib/server/campusMemories";
import { uploadImageBufferToStorage } from "@/lib/server/quadPosts";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { campusMemoryMediaUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";
import { logPipelineFailure, logPipelineStep } from "@/lib/server/pipelineLog";

const PIPELINE = "memory-media";
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * POST — upload a Memory image.
 *
 * Preferred path: multipart/form-data with a compressed image Blob ("file"
 * field). The Blob is streamed to storage and only the public URL is returned —
 * no Base64 ever touches the request body or database.
 *
 * Legacy path: JSON `{ mediaDataUrl }` (small data URLs) is still accepted for
 * backward compatibility and forwarded to the same storage upload.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    logPipelineStep(PIPELINE, "auth", { userId: auth.user.id });

    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:media",
      limit: 20,
      windowMs: 60_000,
    });

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        logPipelineFailure({ pipeline: PIPELINE, step: "read-form", status: 400, code: "MEMORY_MEDIA_MISSING" });
        throw new ApiError(400, "No image file provided.", "MEMORY_MEDIA_MISSING");
      }
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        logPipelineFailure({
          pipeline: PIPELINE,
          step: "validate-mime",
          status: 400,
          code: "MEMORY_MEDIA_FORMAT",
          detail: { mime: mime || "(empty)", fileType: file.type },
        });
        throw new ApiError(
          400,
          `Unsupported image format${mime ? ` (${mime})` : ""}. Use JPG, PNG, or WebP.`,
          "MEMORY_MEDIA_FORMAT",
        );
      }
      logPipelineStep(PIPELINE, "read-form", { mime, bytes: file.size });

      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaUrl = await uploadImageBufferToStorage({
        buffer,
        mime,
        userId: auth.user.id,
        pipeline: PIPELINE,
      });
      logPipelineStep(PIPELINE, "complete", { mediaUrl });
      return ok({ mediaUrl });
    }

    // Legacy JSON data-URL path.
    const input = await readJson(request, campusMemoryMediaUploadSchema);
    const mediaUrl = await normalizeCampusMemoryMediaUrl(input.mediaDataUrl, auth.user.id);
    if (!mediaUrl) {
      logPipelineFailure({ pipeline: PIPELINE, step: "normalize-data-url", status: 400, code: "MEMORY_MEDIA_EMPTY" });
      throw new ApiError(400, "Media upload produced no URL.", "MEMORY_MEDIA_EMPTY");
    }
    logPipelineStep(PIPELINE, "complete", { mediaUrl, path: "legacy-data-url" });
    return ok({ mediaUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      logPipelineFailure({ pipeline: PIPELINE, step: "validate-body", status: 400, code: "VALIDATION_ERROR", error });
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    if (!(error instanceof ApiError)) {
      // Unexpected fault not already logged by a lower stage.
      logPipelineFailure({ pipeline: PIPELINE, step: "unhandled", status: 500, error });
    }
    return fail(error);
  }
}
