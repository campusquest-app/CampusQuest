import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

/**
 * Confirms the caller may personalize For You.
 * Every authenticated user is entitled — CampusQuest Basic is not required.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "events:for-you",
      limit: 60,
      windowMs: 60_000,
    });
    return ok({ entitled: true });
  } catch (error) {
    return fail(error);
  }
}
