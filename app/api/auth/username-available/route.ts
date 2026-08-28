import { fail, ok, ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceKeyedRateLimit, getRequestClientIp } from "@/lib/server/security";

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export async function GET(request: Request) {
  try {
    const ip = getRequestClientIp(request);
    enforceKeyedRateLimit({
      key: `ip:${ip}`,
      routeKey: "auth:username-available",
      limit: 30,
      windowMs: 60_000,
      message: "Too many username checks. Try again shortly.",
      code: "RATE_LIMITED",
    });

    const username = new URL(request.url).searchParams.get("username")?.trim().toLowerCase() ?? "";
    if (!USERNAME_RE.test(username)) {
      return ok({ available: false, valid: false });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (error) {
      throw new ApiError(400, "Unable to check username.", "USERNAME_LOOKUP_FAILED");
    }
    return ok({ available: !data, valid: true });
  } catch (error) {
    return fail(error);
  }
}
