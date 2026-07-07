import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { repairSuspiciousUserXp } from "@/lib/server/adminXpAdjustment";
import { enforceRateLimit } from "@/lib/server/security";
import { z } from "zod";

const repairSchema = z.object({
  username: z.string().trim().min(1).max(64).optional(),
  minXp: z.number().int().min(1).max(10_000_000).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:repair-xp",
      limit: 5,
      windowMs: 60_000,
    });

    const body = repairSchema.parse(await request.json().catch(() => ({})));
    const repaired = await repairSuspiciousUserXp({
      username: body.username ?? "cyrus",
      minXp: body.minXp ?? 50_000,
    });

    return ok({ repaired, count: repaired.length });
  } catch (error) {
    return fail(error);
  }
}
