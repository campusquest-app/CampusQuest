import { fail, ok } from "@/lib/server/http";
import { getViewerEmberAllowance } from "@/lib/server/embers";
import { requireAuthUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    const allowance = await getViewerEmberAllowance({
      userClient: auth.userClient,
      userId: auth.user.id,
    });
    return ok(allowance);
  } catch (error) {
    return fail(error);
  }
}
