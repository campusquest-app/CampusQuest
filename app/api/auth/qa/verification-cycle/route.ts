import { ZodError } from "zod";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import {
  assertVerificationQaCaller,
  getVerificationQaCycleView,
  startVerificationQaCycle,
} from "@/lib/server/verificationQaCycle";

const startSchema = z.object({
  forceNew: z.boolean().optional(),
  cycleId: z.string().trim().min(1).max(80).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    assertVerificationQaCaller({ authenticatedEmail: auth.user.email });
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "auth:qa:verification-cycle:get",
      limit: 60,
      windowMs: 60_000,
    });
    const view = await getVerificationQaCycleView({
      userId: auth.user.id,
      authenticatedEmail: auth.user.email ?? "",
    });
    return ok(view);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    assertVerificationQaCaller({ authenticatedEmail: auth.user.email });
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "auth:qa:verification-cycle:post",
      limit: 8,
      windowMs: 60_000,
    });
    await readJson(request, startSchema);
    const result = await startVerificationQaCycle({
      userId: auth.user.id,
      authenticatedEmail: auth.user.email ?? "",
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, "Invalid verification QA request.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
