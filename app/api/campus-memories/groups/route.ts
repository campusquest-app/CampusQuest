import { fail, ok } from "@/lib/server/http";
import { fetchCampusMemoryGroups, fetchCampusMemoryLocationStats } from "@/lib/server/campusMemories";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";

/** GET — active Memory groups by campus location. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "campus-memories:groups",
      limit: 120,
      windowMs: 60_000,
    });

    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get("stats") === "true";
    const [groups, stats] = await Promise.all([
      fetchCampusMemoryGroups(auth.userClient),
      includeStats ? fetchCampusMemoryLocationStats(auth.userClient) : Promise.resolve(undefined),
    ]);
    return ok({ groups, stats });
  } catch (error) {
    return fail(error);
  }
}
