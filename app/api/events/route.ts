import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { createEvent, listEvents } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { createEventSchema, readJson } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:list", limit: 120, windowMs: 60_000 });
    const url = new URL(request.url);
    const timeframeParam = url.searchParams.get("timeframe");
    const events = await listEvents({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      filters: {
        category: url.searchParams.get("category") ?? undefined,
        organizationId: url.searchParams.get("organizationId") ?? undefined,
        isPaid: url.searchParams.get("isPaid") ? url.searchParams.get("isPaid") === "true" : undefined,
        location: url.searchParams.get("location") ?? undefined,
        timeframe: timeframeParam === "today" || timeframeParam === "this_week" ? timeframeParam : undefined,
      },
    });
    return ok({ events });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:create", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, createEventSchema);
    const event = await createEvent({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      input,
    });
    return ok({ event }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
