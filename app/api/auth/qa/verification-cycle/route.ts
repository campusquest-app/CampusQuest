import { ZodError } from "zod";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import {
  assertVerificationQaCaller,
  createDefaultAdminUserOps,
  dispatchQaVerificationEmail,
  refreshVerificationQaCycleView,
  startVerificationQaCycle,
} from "@/lib/server/verificationQaCycle";

const startSchema = z.object({
  /** When set and matches an already-sent pending cycle, skips a duplicate Resend send. */
  cycleId: z.string().trim().min(1).max(80).optional(),
  /**
   * Explicit intentional start of a new cycle.
   * Remounts / refreshes must not set this — use GET or omit forceNew.
   */
  forceNew: z.boolean().optional(),
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

    const adminOps = await createDefaultAdminUserOps();
    const view = await refreshVerificationQaCycleView({
      userId: auth.user.id,
      authenticatedEmail: auth.user.email ?? "",
      adminOps,
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

    const input = await readJson(request, startSchema);
    const adminOps = await createDefaultAdminUserOps();

    // Remount / refresh resume: same cycleId without forceNew → idempotent (no second email).
    // Intentional new cycle: forceNew true (or no matching pending sent cycle).
    const requestedCycleId = input.forceNew ? null : input.cycleId ?? null;

    const result = await startVerificationQaCycle({
      userId: auth.user.id,
      authenticatedEmail: auth.user.email ?? "",
      requestedCycleId,
      adminOps,
      dispatchQaVerificationEmail,
    });

    // Never report "sent" unless the server proved Auth advanced a send timestamp.
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, "Invalid verification QA request.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
