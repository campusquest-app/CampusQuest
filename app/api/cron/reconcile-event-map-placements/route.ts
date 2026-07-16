import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { reconcileEventMapPlacements } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await reconcileEventMapPlacements({ limit: 120 });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
