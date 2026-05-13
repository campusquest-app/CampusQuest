import { fail, ok } from "@/lib/server/http";
import { getRelationshipStatus } from "@/lib/server/messaging";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request, context: { params: { userId: string } }) {
  try {
    const auth = await requireAuthUser(request as any);
    enforceRateLimit({ userId: auth.user.id, routeKey: "social:relationship", limit: 45, windowMs: 60_000 });
    const relationship = await getRelationshipStatus({
      userClient: auth.userClient,
      userId: auth.user.id,
      otherUserId: context.params.userId,
    });
    return ok(relationship);
  } catch (error) {
    return fail(error);
  }
}
