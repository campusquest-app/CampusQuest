import { ApiError, fail, ok } from "@/lib/server/http";
import { parsePartnerSuggestion } from "@/lib/partners/partnerSuggestion";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { submitPartnerSuggestion } from "@/lib/server/partnerSuggestions";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const { user, userClient } = await requireAuthUser(request);
    enforceRateLimit({
      userId: user.id,
      routeKey: "partners:suggestions",
      limit: 3,
      windowMs: 10 * 60_000,
      message: "You\u2019re sending suggestions too quickly. Try again in a few minutes.",
    });
    await assertAccountCanSocialize(userClient, user.id);
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const parsed = parsePartnerSuggestion(body);
    if (!parsed.ok) throw new ApiError(400, parsed.message, "VALIDATION_ERROR");
    if (parsed.honeypot) return ok({ submitted: true });
    const saved = await submitPartnerSuggestion({ admin: createAdminClient(), userId: user.id, input: parsed.value });
    return ok({ submitted: true, id: saved.id });
  } catch (error) {
    return fail(error);
  }
}
