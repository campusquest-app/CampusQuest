import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { setEventRsvp } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";
import { eventRsvpSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: { eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:rsvp", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, eventRsvpSchema);
    touchUserActivityFromAuth(auth);

    const rsvp = await setEventRsvp({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      eventId: context.params.eventId,
      status: input.status,
    });
    return ok({ rsvp });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
