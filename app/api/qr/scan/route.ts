import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { scanCampusQuestQrCode } from "@/lib/server/qrCodeScan";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { campusQrScanSchema, readJson } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "qr:scan", limit: 40, windowMs: 60_000 });
    const input = await readJson(request, campusQrScanSchema);

    const result = await scanCampusQuestQrCode({
      userClient: auth.userClient,
      userId: auth.user.id,
      code: input.code,
      deviceHint: input.deviceHint,
      idempotencyKey: input.idempotencyKey,
      userEmail: auth.user.email,
    });

    return ok(
      {
        scan: result.scan,
        xpAwarded: result.scan.xpAwarded,
        milestonesUnlocked: result.milestonesUnlocked,
        leveledUp: result.leveledUp,
        level: result.player.progression.level,
        totalXp: result.player.progression.totalXp,
        player: result.player,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
