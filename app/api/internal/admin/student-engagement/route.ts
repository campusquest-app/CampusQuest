import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import {
  getStudentEngagementAnalytics,
  resolveEngagementDateRange,
  type EngagementRangePreset,
} from "@/lib/server/studentEngagementAnalytics";

const PRESETS = new Set<EngagementRangePreset>(["7d", "30d", "semester", "custom"]);

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request as any);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:student-engagement",
      limit: 30,
      windowMs: 60_000,
    });

    const url = new URL(request.url);
    const presetRaw = (url.searchParams.get("preset") ?? "30d").trim() as EngagementRangePreset;
    const preset = PRESETS.has(presetRaw) ? presetRaw : "30d";
    const range = resolveEngagementDateRange({
      preset,
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
    });

    const snapshot = await getStudentEngagementAnalytics(range);
    return ok(snapshot);
  } catch (error) {
    return fail(error);
  }
}
