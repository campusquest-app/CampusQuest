import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { fail, ok } from "@/lib/server/http";
import { listQrScansAdmin } from "@/lib/server/qrCodeAdmin";
import { enforceRateLimit } from "@/lib/server/security";

export async function GET(request: Request) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-scans:list", limit: 60, windowMs: 60_000 });
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));
    const scans = await listQrScansAdmin(limit);
    return ok({ scans });
  } catch (error) {
    return fail(error);
  }
}
