import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { initDirectUpload, parseDirectUploadInit } from "@/lib/server/quadDirectUpload";

/**
 * Step 1 of a direct-to-Storage media upload. JSON only — media bytes never pass through here.
 * Body: { kind, mimeType, fileSizeBytes, idempotencyKey, durationSeconds?, width?, height?, hasAudio? }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:media:upload-init", limit: 60, windowMs: 60_000 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid upload request.", "INVALID_JSON");
    }
    const input = parseDirectUploadInit(body);
    return ok(await initDirectUpload({ userId: auth.user.id, input }));
  } catch (error) {
    return fail(error);
  }
}
