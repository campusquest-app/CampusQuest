import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { getUserPushSettings, upsertUserPushSettings } from "@/lib/server/pushDevices";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson } from "@/lib/server/validation";

const patchSchema = z.object({
  pushEnabled: z.boolean().optional(),
  messagesEnabled: z.boolean().optional(),
  socialEnabled: z.boolean().optional(),
  eventsEnabled: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:push-settings:get", limit: 40, windowMs: 60_000 });
    const settings = await getUserPushSettings(auth.user.id);
    return ok({ settings });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:push-settings:patch", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, patchSchema);
    const settings = await upsertUserPushSettings(auth.user.id, input);
    return ok({ settings });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
