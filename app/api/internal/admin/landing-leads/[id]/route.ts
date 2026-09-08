import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { updateLandingLeadStatus } from "@/lib/server/landingIntake";
import { readJson, uuidSchema } from "@/lib/server/validation";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "spam"]),
});

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requireAdminUser(request as never);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:landing-leads:patch",
      limit: 40,
      windowMs: 60_000,
    });

    const id = uuidSchema.parse(context.params.id);
    const body = await readJson(request, patchSchema);
    const updated = await updateLandingLeadStatus(id, body.status);
    return ok({ lead: updated });
  } catch (error) {
    return fail(error);
  }
}
