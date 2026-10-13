import { ApiError, fail, ok } from "@/lib/server/http";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { organizationAvailabilityQuerySchema } from "@/lib/identity/schemas";
import { getOrganizationAvailability } from "@/lib/server/verificationRequests";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "verification:org-availability", limit: 40, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const parsed = organizationAvailabilityQuerySchema.safeParse({
      name: searchParams.get("name") ?? "",
      organizationId: searchParams.get("organizationId") || null,
    });
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Enter at least 2 characters.", "VALIDATION_ERROR");
    }
    const status = await getOrganizationAvailability({
      admin: createAdminClient(),
      name: parsed.data.name,
      organizationId: parsed.data.organizationId ?? null,
    });
    return ok({ status });
  } catch (error) {
    return fail(error);
  }
}
