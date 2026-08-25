import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createStudentBusiness, listMyStudentBusinesses } from "@/lib/server/marketplace";
import { createStudentBusinessSchema } from "@/lib/marketplace/schemas";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:businesses:get", limit: 60, windowMs: 60_000 });
    const businesses = await listMyStudentBusinesses({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok({ businesses });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "marketplace:businesses:create", limit: 8, windowMs: 60_000 });
    const input = await readJson(request, createStudentBusinessSchema);
    const business = await createStudentBusiness({
      userClient: auth.userClient,
      userId: auth.user.id,
      input,
    });
    return ok({ business }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
