import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await runUrinvolvedSync("cron");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
