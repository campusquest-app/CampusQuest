import { fail, ok } from "@/lib/server/http";
import { uploadMarketplaceImage } from "@/lib/server/marketplace";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { sniffImageMimeFromBuffer } from "@/lib/server/sniffImageMime";
import { isUploadableImageMime, normalizeImageMime } from "@/lib/quadMedia";
import { ApiError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "verification:media", limit: 20, windowMs: 60_000 });
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "Use multipart/form-data for media upload.", "MEDIA_MULTIPART_REQUIRED");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      throw new ApiError(400, "No photo provided.", "MEDIA_MISSING");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = typeof (file as File).name === "string" ? (file as File).name : null;
    const mime = normalizeImageMime(file.type || "") || sniffImageMimeFromBuffer(buffer, fileName) || "";
    if (!isUploadableImageMime(mime)) {
      throw new ApiError(400, "Use a JPEG, PNG, or WebP image.", "IMAGE_FORMAT_UNSUPPORTED");
    }
    const uploaded = await uploadMarketplaceImage({
      userId: auth.user.id,
      buffer,
      mime,
    });
    return ok(uploaded, 201);
  } catch (error) {
    return fail(error);
  }
}
