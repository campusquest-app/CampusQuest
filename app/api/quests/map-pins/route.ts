import { fail, ok } from "@/lib/server/http";
import { listGroupedMapLocations } from "@/lib/server/groupedMapLocations";

export async function GET() {
  try {
    const groups = await listGroupedMapLocations();
    return ok({ groups });
  } catch (error) {
    return fail(error);
  }
}
