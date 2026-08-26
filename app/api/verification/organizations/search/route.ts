import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { verificationOrgSearchQuerySchema } from "@/lib/identity/schemas";
import { searchOrganizationsForClaim } from "@/lib/server/verificationRequests";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "verification:org-search", limit: 40, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const parsed = verificationOrgSearchQuerySchema.safeParse({ q: searchParams.get("q") ?? "" });
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Enter at least 2 characters.", "VALIDATION_ERROR");
    }
    const organizations = await searchOrganizationsForClaim({
      userClient: auth.userClient,
      query: parsed.data.q,
    });
    return ok({ organizations });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid search.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
