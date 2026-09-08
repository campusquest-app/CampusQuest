import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { LANDING_CONTACT_STATUSES, listLandingContacts } from "@/lib/server/landingIntake";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:landing-contacts:get",
      limit: 40,
      windowMs: 60_000,
    });

    const statusParam = new URL(request.url).searchParams.get("status");
    const status =
      statusParam && (LANDING_CONTACT_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as (typeof LANDING_CONTACT_STATUSES)[number])
        : undefined;

    const contacts = await listLandingContacts(status);
    return ok({ contacts });
  } catch (error) {
    return fail(error);
  }
}
