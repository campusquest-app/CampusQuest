import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson, setUserSafetyStatusSchema } from "@/lib/server/validation";
function moderationKey() {
  const key = process.env.MESSAGE_MODERATION_API_KEY;
  if (!key) {
    throw new ApiError(500, "Moderation key is not configured.", "MODERATION_KEY_MISSING");
  }
  return key;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "internal:moderation:users:status", limit: 15, windowMs: 60_000 });
    const input = await readJson(request, setUserSafetyStatusSchema);
    const url = new URL("/api/moderation/users/status", request.url);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-message-moderation-key": moderationKey(),
        "x-admin-email": auth.normalizedEmail,
      },
      body: JSON.stringify({
        ...input,
        updatedBy: auth.user.id,
        adminEmail: auth.normalizedEmail,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({} as { data?: unknown; error?: { message?: string; code?: string } }));
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.error?.message ?? "Moderation request failed.",
        payload?.error?.code ?? "MODERATION_REQUEST_FAILED",
      );
    }
    return ok(payload?.data);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
