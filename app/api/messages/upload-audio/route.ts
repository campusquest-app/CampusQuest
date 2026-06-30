import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { uploadDmAudio } from "@/lib/server/dmRichMessages";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { dmAudioUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "messages:upload-audio",
      limit: 20,
      windowMs: 60_000,
    });
    const input = await readJson(request, dmAudioUploadSchema);
    touchUserActivityFromAuth(auth);
    const audioUrl = await uploadDmAudio({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: input.conversationId,
      audioDataUrl: input.audioDataUrl,
    });
    return ok({ audioUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
