import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { normalizeCampusMemoryMediaUrl } from "@/lib/server/campusMemories";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { campusMemoryMediaUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

/** POST — upload Memory image (data URL) to storage; returns public https URL. */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:media",
      limit: 20,
      windowMs: 60_000,
    });

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
