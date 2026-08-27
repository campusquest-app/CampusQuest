import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { eventRsvpSchema, readJson } from "@/lib/server/validation";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { touchUserActivityFromAuth } from "@/lib/server/userActivity";

export async function POST(request: Request, context: { params: { eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "external-events:rsvp", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, eventRsvpSchema);
    touchUserActivityFromAuth(auth);
    await requireVerifiedSchoolForCoreAccess({
      userClient: auth.userClient as any,
      user: {
        id: auth.user.id,
        email: auth.user.email ?? null,
        email_confirmed_at: (auth.user as any).email_confirmed_at ?? null,
        confirmed_at: (auth.user as any).confirmed_at ?? null,
      },
    });

    const { data: event, error: eventError } = await auth.userClient
      .from("external_events")
      .select("id, cq_rsvp_enabled, is_active")
      .eq("id", context.params.eventId)
      .maybeSingle();
    if (eventError) throw new ApiError(400, eventError.message, "EVENT_LOOKUP_FAILED");
    if (!event) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
    if (!event.is_active || !event.cq_rsvp_enabled) {
      throw new ApiError(400, "CampusQuest RSVP is not available for this event.", "RSVP_UNAVAILABLE");
    }

    const { data, error } = await auth.userClient
      .from("external_event_rsvps")
      .upsert(
        {
          event_id: context.params.eventId,
          user_id: auth.user.id,
          status: input.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,user_id" },
      )
      .select("id, status")
      .single();
    if (error || !data) throw new ApiError(400, error?.message ?? "Could not save RSVP.", "RSVP_FAILED");
    return ok({ rsvp: data });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
