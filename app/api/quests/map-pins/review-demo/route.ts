import { fail, ok } from "@/lib/server/http";
import { listReviewDemoMapLocations } from "@/lib/server/groupedMapLocations";
import { viewerCanSeeReviewDemo } from "@/lib/server/reviewDemo";
import { requireAuthUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userClient } = await requireAuthUser(request);
    if (!(await viewerCanSeeReviewDemo(userClient))) {
      return ok({ eligible: false, groups: [] });
    }
    const groups = await listReviewDemoMapLocations(userClient);
    return ok({ eligible: true, groups });
  } catch (error) {
    return fail(error);
  }
}
