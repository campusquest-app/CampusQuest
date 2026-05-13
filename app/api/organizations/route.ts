import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { createOrganization, listOrganizations } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createOrganizationSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:list", limit: 100, windowMs: 60_000 });
    const url = new URL(request.url);
    const organizations = await listOrganizations({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      filters: {
        category: url.searchParams.get("category") ?? undefined,
        schoolName: url.searchParams.get("school") ?? undefined,
        query: url.searchParams.get("query") ?? undefined,
        eligibleEventHostsOnly: url.searchParams.get("eligibleEventHostsOnly") === "1",
      },
    });
    return ok({ organizations });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    if (!isAdminEmail(auth.user.email ?? "")) {
      return fail(
        new ApiError(
          403,
          "Submit an organization request for admin review from the Organizations tab.",
          "ORG_CREATE_STUDENT_DISABLED",
        ),
      );
    }
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "organizations:create", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, createOrganizationSchema);
    const organization = await createOrganization({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      input,
    });
    return ok({ organization }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
