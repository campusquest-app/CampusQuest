import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { discardDirectUpload } from "@/lib/server/quadDirectUpload";

/** Release an unattached upload the user removed from the composer. Body: { mediaId } */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:media:upload-discard", limit: 60, windowMs: 60_000 });

    let body: { mediaId?: unknown };
    try {
      body = (await request.json()) as { mediaId?: unknown };
    } catch {
      throw new ApiError(400, "Invalid request.", "INVALID_JSON");
    }
    const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
      throw new ApiError(400, "A valid media id is required.", "MEDIA_ID_INVALID");
    }
    return ok(await discardDirectUpload({ userId: auth.user.id, mediaId }));
  } catch (error) {
    return fail(error);
  }
}
