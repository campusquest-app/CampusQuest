import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { onboardingFunnelEventSchema, readJson } from "@/lib/server/validation";

const SENSITIVE_EVENT_RE = /password|otp|token|secret|code/i;

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "me:onboarding-events",
      limit: 40,
      windowMs: 60_000,
    });
    const input = await readJson(request, onboardingFunnelEventSchema);
    if (SENSITIVE_EVENT_RE.test(input.eventName)) {
      throw new ApiError(400, "Invalid event.", "VALIDATION_ERROR");
    }
    const { error } = await auth.userClient.from("onboarding_funnel_events").insert({
      user_id: auth.user.id,
      event_name: input.eventName,
      step_number: input.stepNumber ?? null,
      elapsed_ms: input.elapsedMs ?? null,
      skipped: input.skipped ?? null,
    });
    if (error) {
      if (/onboarding_funnel_events/i.test(error.message) || error.code === "42P01") {
        return ok({ recorded: false, skipped: true });
      }
      throw new ApiError(400, "Could not record event.", "ONBOARDING_EVENT_FAILED");
    }
    return ok({ recorded: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, "Invalid event.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
