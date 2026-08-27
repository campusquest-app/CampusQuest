import { z } from "zod";
import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { createManualExternalEvent } from "@/lib/server/eventSources/manualEvents";
import { readJson } from "@/lib/server/validation";

const bodySchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(80).optional(),
  organizationName: z.string().trim().max(200).optional(),
  venueName: z.string().trim().max(180).optional(),
  address: z.string().trim().max(240).optional(),
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().optional(),
  eventUrl: z.string().trim().url().optional(),
  ticketUrl: z.string().trim().url().optional(),
  sport: z.string().trim().max(80).optional(),
  opponent: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:manual-events", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, bodySchema);
    const event = await createManualExternalEvent(input);
    return ok({ event }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
