import { ZodError } from "zod";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { listAdminUrinvolvedPlacements } from "@/lib/server/externalEventMapOverrides";
import { ApiError, fail, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);
    const catalog = (await getCampusLocations({ includeInactive: false, refreshCache: true })).map(
      (row) => ({ slug: row.slug, name: row.name }),
    );
    const placements = await listAdminUrinvolvedPlacements({ catalog });
    return ok({
      catalog,
      ...placements,
    });
  } catch (error) {
    return fail(error);
  }
}
