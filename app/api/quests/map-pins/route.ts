import { fail, ok } from "@/lib/server/http";
import { listGroupedMapLocations } from "@/lib/server/groupedMapLocations";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    await requireAuthUser(request);
    const groups = await listGroupedMapLocations();
    return ok({ groups });
  } catch (error) {
    return fail(error);
  }
}
