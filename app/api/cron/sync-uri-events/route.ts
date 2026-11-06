import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runUriEventsSync } from "@/lib/server/eventSources/uriEventsSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * URI Events (Localist) sync. Schedule is every 30 minutes in vercel.json.
 * `?dryRun=1` parses the public API and returns counts without writing.
 */
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await runUriEventsSync("cron", { dryRun });
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
