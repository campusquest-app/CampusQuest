import { fail, ok } from "@/lib/server/http";
import { fetchCampusMemoryGroups } from "@/lib/server/campusMemories";
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

    const groups = await fetchCampusMemoryGroups(auth.userClient);
    return ok({ groups });
  } catch (error) {
    return fail(error);
  }
}
