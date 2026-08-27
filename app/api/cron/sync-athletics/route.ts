import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await runAthleticsSync("cron");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
