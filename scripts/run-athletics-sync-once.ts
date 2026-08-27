import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runAthleticsSync } from "../lib/server/eventSources/athleticsSync";
import { athleticsFeedUrlsFromEnv, parseAthleticsFeed, athleticsFeedFormatFromEnv } from "../lib/eventSources/adapters/athletics";
import { athleticsEventEligibleForCampusMap } from "../lib/eventSources/athleticsMapEligibility";
import { parseIcsEvents } from "../lib/eventSources/ics";
import { createAdminClient } from "../lib/server/supabase";
import { resolveUrinvolvedEventLocation } from "../lib/server/urinvolved/eventLocation";
import { hasValidCoordinates } from "../lib/server/urinvolved/validCoordinates";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

async function inspectFeed() {
  const urls = athleticsFeedUrlsFromEnv();
  const format = athleticsFeedFormatFromEnv(process.env.URI_ATHLETICS_FEED_FORMAT);
  const inspection = {
    urlsConfigured: urls.length,
    httpStatuses: [] as number[],
    rawRecords: 0,
    parsed: 0,
    invalidRecords: 0,
    unresolvedLocations: [] as string[],
  };
  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/calendar, application/json;q=0.9, */*;q=0.8",
        "User-Agent": "CampusQuest/1.0 (URI campus events; +https://campusquestapp.com)",
      },
      cache: "no-store",
    });
    inspection.httpStatuses.push(response.status);
    const raw = await response.text();
    if (format === "ics") {
      const ics = parseIcsEvents(raw);
      const parsed = parseAthleticsFeed(raw, format);
      inspection.rawRecords += ics.length;
      inspection.parsed += parsed.length;
      inspection.invalidRecords += Math.max(0, ics.length - parsed.length);
      for (const event of parsed) {
        if (event.homeAway === "away") continue;
        const located = resolveUrinvolvedEventLocation({
          venueName: event.venueName,
          address: event.address,
        });
        if (!hasValidCoordinates(located.locationMatch) && event.venueName) {
          inspection.unresolvedLocations.push(event.venueName);
        }
      }
    } else {
      const parsed = parseAthleticsFeed(raw, format);
      inspection.parsed += parsed.length;
    }
  }
  inspection.unresolvedLocations = [...new Set(inspection.unresolvedLocations)].sort();
  return inspection;
}

async function main() {
  const started = Date.now();
  const inspection = await inspectFeed();
  const first = await runAthleticsSync("manual");
  const second = await runAthleticsSync("manual");
  const admin = createAdminClient();
  const { data: rows, error, count } = await admin
    .from("external_events")
    .select(
      "id, source, external_id, title, sport, opponent, home_away, venue_name, starts_at, ends_at, event_url, ticket_url, broadcast_url, is_active, canonical_event_id, latitude, longitude",
      { count: "exact" },
    )
    .eq("source", "athletics")
    .eq("is_active", true)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);

  const sample = (rows ?? []).find((row) => row.home_away === "home" && row.venue_name && /ryan|keaney|soccer/i.test(String(row.venue_name)))
    ?? rows?.[0]
    ?? null;
  const awaySample = (rows ?? []).find((row) => row.home_away === "away") ?? null;

  console.log(
    JSON.stringify(
      {
        elapsedMs: Date.now() - started,
        inspection,
        first: {
          success: first.success,
          skipped: first.skipped ?? false,
          skipReason: first.skipReason ?? null,
          eventsReceived: first.eventsReceived,
          eventsCreated: first.eventsCreated,
          eventsUpdated: first.eventsUpdated,
          eventsFailed: first.eventsFailed,
          duplicatesMerged: first.duplicatesMerged,
          errors: first.errors.slice(0, 8),
        },
        second: {
          success: second.success,
          eventsReceived: second.eventsReceived,
          eventsCreated: second.eventsCreated,
          eventsUpdated: second.eventsUpdated,
          eventsFailed: second.eventsFailed,
          duplicatesMerged: second.duplicatesMerged,
          errors: second.errors.slice(0, 8),
        },
        activeAthletics: count ?? rows?.length ?? 0,
        sample,
        awaySample: awaySample
          ? {
              title: awaySample.title,
              venue: awaySample.venue_name,
              homeAway: awaySample.home_away,
              mapEligible: athleticsEventEligibleForCampusMap({
                source: "athletics",
                homeAway: String(awaySample.home_away ?? ""),
              }),
              hasCampusCoords: awaySample.latitude != null && awaySample.longitude != null,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
