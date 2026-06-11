import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";

export async function POST(request: Request) {
  try {
    assertCronSecret(request);
    const result = await runUrinvolvedSync("api");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
