import { fail, ok } from "@/lib/server/http";
import { searchPublicGuilds } from "@/lib/server/friendsGuildsSearch";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "guild:search",
      limit: 60,
      windowMs: 60_000,
    });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limitRaw = Number(searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, limitRaw)) : 8;

    const results = await searchPublicGuilds({
      userClient: auth.userClient,
      query: q,
      limit,
    });

    return ok({ results });
  } catch (error) {
    return fail(error);
  }
}
