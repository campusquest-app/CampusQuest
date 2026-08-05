import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { searchTaggableEntities } from "@/lib/server/entityTagSearch";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:tags:search", limit: 60, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const filterRaw = (searchParams.get("filter") ?? "all").toLowerCase();
    const filter =
      filterRaw === "people" || filterRaw === "organizations" || filterRaw === "events"
        ? filterRaw
        : "all";
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") || "10") || 10));
    const results = await searchTaggableEntities({
      viewerId: auth.user.id,
      query: q,
      filter,
      limit,
    });
    return ok({ results });
  } catch (error) {
    return fail(error);
  }
}
