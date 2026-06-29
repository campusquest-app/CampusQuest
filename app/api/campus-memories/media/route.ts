import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { normalizeCampusMemoryMediaUrl } from "@/lib/server/campusMemories";
import { uploadImageBufferToStorage } from "@/lib/server/quadPosts";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { campusMemoryMediaUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

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
        throw new ApiError(400, "No image file provided.", "MEMORY_MEDIA_MISSING");
      }
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        throw new ApiError(400, "Unsupported image format.", "MEMORY_MEDIA_FORMAT");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaUrl = await uploadImageBufferToStorage({
        buffer,
        mime,
        userId: auth.user.id,
      });
      return ok({ mediaUrl });
    }

    const input = await readJson(request, campusMemoryMediaUploadSchema);
    const mediaUrl = await normalizeCampusMemoryMediaUrl(input.mediaDataUrl, auth.user.id);
    if (!mediaUrl) {
      throw new ApiError(400, "Media upload produced no URL.", "MEMORY_MEDIA_EMPTY");
    }

    return ok({ mediaUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
