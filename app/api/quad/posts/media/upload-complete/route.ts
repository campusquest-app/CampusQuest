import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { completeDirectUpload } from "@/lib/server/quadDirectUpload";

/** Keeps the optional cover frame well under Vercel's request body limit. */
const MAX_POSTER_BYTES = 3 * 1024 * 1024;

/**
 * Step 2 of a direct-to-Storage media upload: verify the stored object and mark it ready.
 * multipart/form-data fields: mediaId, poster? (small cover frame for videos).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:media:upload-complete", limit: 60, windowMs: 60_000 });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "Use multipart/form-data.", "MEDIA_MULTIPART_REQUIRED");
    }
    const form = await request.formData();
    const mediaId = String(form.get("mediaId") ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
      throw new ApiError(400, "A valid media id is required.", "MEDIA_ID_INVALID");
    }

    let poster: { buffer: Buffer; mime: string } | null = null;
    const posterPart = form.get("poster");
    if (posterPart instanceof Blob && posterPart.size > 0 && posterPart.size <= MAX_POSTER_BYTES) {
      poster = {
        buffer: Buffer.from(await posterPart.arrayBuffer()),
        mime: (posterPart.type || "image/jpeg").toLowerCase(),
      };
    }

    return ok(await completeDirectUpload({ userId: auth.user.id, mediaId, poster }));
  } catch (error) {
    return fail(error);
  }
}
