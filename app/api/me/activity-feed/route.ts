import { fail, ok } from "@/lib/server/http";
import { listUserActivityFeed } from "@/lib/server/userActivityEvents";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const url = new URL(request.url);
    const requestedUserId = url.searchParams.get("userId")?.trim();
    const userId = requestedUserId && requestedUserId === auth.user.id ? requestedUserId : auth.user.id;
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const events = await listUserActivityFeed({
      client: auth.userClient,
      userId,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return ok({ events });
  } catch (error) {
    return fail(error);
  }
}
