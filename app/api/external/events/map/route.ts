import { fail, ok } from "@/lib/server/http";
import { listExternalMapEventMarkers } from "@/lib/server/externalContent";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "external:events-map", limit: 60, windowMs: 60_000 });
    const markers = await listExternalMapEventMarkers();
    return ok({ markers });
  } catch (error) {
    return fail(error);
  }
}
