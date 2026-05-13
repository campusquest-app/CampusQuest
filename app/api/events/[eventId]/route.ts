import { ZodError } from "zod";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { deleteEvent, getEventDetails, updateEvent } from "@/lib/server/eventsOrganizations";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { readJson, updateEventSchema } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: { eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:get", limit: 120, windowMs: 60_000 });
    const event = await getEventDetails({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      emailConfirmedAt: (auth.user as any).email_confirmed_at ?? null,
      confirmedAt: (auth.user as any).confirmed_at ?? null,
      eventId: context.params.eventId,
    });
    return ok({ event });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: { params: { eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    await assertAccountCanSocialize(auth.userClient as any, auth.user.id);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:update", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, updateEventSchema);
    const event = await updateEvent({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      eventId: context.params.eventId,
      input,
    });
    return ok({ event });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}

export async function DELETE(request: Request, context: { params: { eventId: string } }) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "events:delete", limit: 20, windowMs: 60_000 });
    const deleted = await deleteEvent({
      userClient: auth.userClient as any,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
      eventId: context.params.eventId,
    });
    return ok(deleted);
  } catch (error) {
    return fail(error);
  }
}
