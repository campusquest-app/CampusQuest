import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { fail, ok } from "@/lib/server/http";
import { regenerateQrCodePngAdmin } from "@/lib/server/qrCodeAdmin";
import { enforceRateLimit } from "@/lib/server/security";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:regenerate", limit: 30, windowMs: 60_000 });
    const result = await regenerateQrCodePngAdmin(context.params.id, new URL(request.url).origin);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
