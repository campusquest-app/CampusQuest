import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { listBetaFounders, tryAwardTorchBearerBadge } from "@/lib/server/betaFounders";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import { z } from "zod";

const grantSchema = z.object({
  userId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:beta-founders", limit: 60, windowMs: 60_000 });
    const roster = await listBetaFounders();
    return ok(roster);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:beta-founders:grant", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, grantSchema);
    const rosterBefore = await listBetaFounders();
    if (rosterBefore.fullyClaimed) {
      throw new ApiError(409, "Founder badges are fully claimed.", "TORCH_BEARER_FULL");
    }

    const result = await tryAwardTorchBearerBadge({
      userId: input.userId,
      allowAdmin: true,
    });

    if (!result) {
      throw new ApiError(409, "Could not grant Torch Bearer Badge.", "TORCH_BEARER_GRANT_FAILED");
    }

    const roster = await listBetaFounders();
    return ok({ result, roster });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
