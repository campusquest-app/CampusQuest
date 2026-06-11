import { fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { enforceRateLimit } from "@/lib/server/security";
import { getUrinvolvedSyncStatus, runUrinvolvedSync } from "@/lib/server/urinvolved/sync";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:urinvolved-status", limit: 30, windowMs: 60_000 });
    const status = await getUrinvolvedSyncStatus();
    return ok({ status });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:urinvolved-sync", limit: 5, windowMs: 60_000 });
    const result = await runUrinvolvedSync("manual");
    const status = await getUrinvolvedSyncStatus();
    return ok({ result, status });
  } catch (error) {
    return fail(error);
  }
}
