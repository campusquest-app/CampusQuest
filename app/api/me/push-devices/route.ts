import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { disablePushDeviceForUser, upsertPushDevice } from "@/lib/server/pushDevices";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson } from "@/lib/server/validation";

const registerSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  deviceToken: z.string().trim().min(16).max(512),
  deviceId: z.string().trim().max(120).optional().nullable(),
  appVersion: z.string().trim().max(40).optional().nullable(),
  environment: z.enum(["development", "production"]).optional(),
});

const disableSchema = z.object({
  deviceToken: z.string().trim().min(16).max(512).optional().nullable(),
  deviceId: z.string().trim().max(120).optional().nullable(),
  disableAll: z.boolean().optional(),
});

/** POST — register / refresh APNs device token for the signed-in user. */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:push-devices:post", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, registerSchema);
    const device = await upsertPushDevice({
      userId: auth.user.id,
      platform: input.platform,
      deviceToken: input.deviceToken,
      deviceId: input.deviceId,
      appVersion: input.appVersion,
      environment: input.environment,
    });
    return ok({
      id: device.id,
      platform: device.platform,
      enabled: device.enabled,
      environment: device.environment,
      lastSeenAt: device.last_seen_at,
      // Never echo the full token back unnecessarily.
      tokenFingerprint: device.device_token.slice(0, 8),
    });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}

/** DELETE — disable this device (or all devices) on logout / user switch. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:push-devices:delete", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, disableSchema);
    const count = await disablePushDeviceForUser({
      userId: auth.user.id,
      deviceToken: input.disableAll ? null : input.deviceToken,
      deviceId: input.disableAll ? null : input.deviceId,
    });
    return ok({ disabled: count });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
