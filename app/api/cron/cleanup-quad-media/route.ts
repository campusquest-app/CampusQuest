import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { cleanupStaleQuadMediaUploads } from "@/lib/server/quadDirectUpload";

export const dynamic = "force-dynamic";

/** Daily sweep of abandoned, never-attached Quad media uploads. */
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(await cleanupStaleQuadMediaUploads());
  } catch (error) {
    return fail(error);
  }
}
