import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { LANDING_LEAD_STATUSES, listLandingLeads } from "@/lib/server/landingIntake";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:landing-leads:get",
      limit: 40,
      windowMs: 60_000,
    });

    const statusParam = new URL(request.url).searchParams.get("status");
    const status =
      statusParam && (LANDING_LEAD_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as (typeof LANDING_LEAD_STATUSES)[number])
        : undefined;

    const leads = await listLandingLeads(status);
    return ok({ leads });
  } catch (error) {
    return fail(error);
  }
}
