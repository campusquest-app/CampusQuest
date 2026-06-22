import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { uploadDmImage } from "@/lib/server/dmRichMessages";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { dmImageUploadSchema, readJson } from "@/lib/server/validation";
import { formatZodError } from "@/lib/server/zodErrors";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "messages:upload-image",
      limit: 20,
      windowMs: 60_000,
    });
    const input = await readJson(request, dmImageUploadSchema);
    touchUserActivityFromAuth(auth);
    const imageUrl = await uploadDmImage({
      userClient: auth.userClient,
      userId: auth.user.id,
      conversationId: input.conversationId,
      imageDataUrl: input.imageDataUrl,
    });
    return ok({ imageUrl });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
