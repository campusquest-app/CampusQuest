import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scoreEventsSearch } from "../lib/client/eventDiscovery";
import { athleticsEventEligibleForCampusMap } from "../lib/eventSources/athleticsMapEligibility";
import { externalEventToRecommendationEntity } from "../lib/recommendations/adapters";
import { emptyRecommendationProfile } from "../lib/recommendations/profile";
import { scoreRecommendationEntity } from "../lib/recommendations/score";
import { getCampusLocations } from "../lib/server/campusLocationsDb";
import { getTodayExternalEventsForMap } from "../lib/server/urinvolved/todayMapEvents";

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

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: events, error } = await admin
    .from("external_events")
    .select(
      "id, source, external_id, title, sport, opponent, home_away, venue_name, starts_at, event_url, ticket_url, broadcast_url, latitude, longitude, is_active",
    )
    .eq("source", "athletics")
    .eq("is_active", true)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);

  const now = Date.now();
  const upcomingHomeCampus = (events ?? []).filter((row) => {
    const start = Date.parse(row.starts_at as string);
    return (
      start >= now &&
      row.home_away === "home" &&
      athleticsEventEligibleForCampusMap({ source: "athletics", homeAway: String(row.home_away) }) &&
      row.latitude != null &&
      row.longitude != null
    );
  });
  const upcomingAway = (events ?? []).filter(
    (row) => row.home_away === "away" && Date.parse(row.starts_at as string) >= now,
  );

  function searchHits(q: string) {
    return (events ?? [])
      .map((row) => ({
        title: String(row.title),
        score: scoreEventsSearch(
          {
            title: String(row.title),
            organizationName: String(row.sport ?? ""),
            location: String(row.venue_name ?? ""),
            category: "Athletics",
            tags: [row.sport, row.opponent].filter(Boolean) as string[],
            description: "",
            sport: String(row.sport ?? ""),
            opponent: String(row.opponent ?? ""),
          },
          q,
        ),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  const holyCross = (events ?? []).find(
    (row) => /holy cross/i.test(String(row.title)) && /basketball/i.test(String(row.title)),
  );
  const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
  const rec = holyCross
    ? scoreRecommendationEntity(
        externalEventToRecommendationEntity({
          id: String(holyCross.id),
          title: String(holyCross.title),
          category: "Athletics",
          sport: String(holyCross.sport ?? ""),
          opponent: String(holyCross.opponent ?? ""),
          venueName: String(holyCross.venue_name ?? ""),
          startsAt: String(holyCross.starts_at),
        }),
        profile,
        now,
      )
    : null;

  const { listExternalEventsFeed } = await import("../lib/server/externalContent");
  const feedBasketball = await listExternalEventsFeed({ search: "basketball", includePast: true });
  const feedRyan = await listExternalEventsFeed({ search: "Ryan Center", includePast: true });
  const sample = feedBasketball.events.find((event) => /holy cross/i.test(event.title));
  const { count: orgCount } = await admin
    .from("external_organizations")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  const { count: urinCount } = await admin
    .from("external_events")
    .select("id", { count: "exact", head: true })
    .eq("source", "urinvolved");

  const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
    slug: row.slug,
    name: row.name,
  }));
  const pinsAug29 = await getTodayExternalEventsForMap({
    catalog,
    now: new Date("2026-08-29T20:00:00-04:00"),
  });
  const pinsAwayDay = await getTodayExternalEventsForMap({
    catalog,
    now: new Date("2026-08-28T20:00:00-04:00"),
  });

  console.log(
    JSON.stringify(
      {
        athleticsActive: events?.length ?? 0,
        upcomingHomeCampus: upcomingHomeCampus.slice(0, 5).map((row) => ({
          title: row.title,
          venue: row.venue_name,
          starts: row.starts_at,
          homeAway: row.home_away,
          coords: [row.latitude, row.longitude],
        })),
        upcomingAway: upcomingAway.slice(0, 3).map((row) => ({
          title: row.title,
          venue: row.venue_name,
          hasCoords: row.latitude != null,
        })),
        search: {
          basketball: searchHits("basketball").map((row) => row.title),
          football: searchHits("football").map((row) => row.title),
          ryan: searchHits("Ryan Center").map((row) => row.title),
          meade: searchHits("Meade").map((row) => row.title),
          holyCross: searchHits("Holy Cross").map((row) => row.title),
        },
        forYou: rec
          ? { title: holyCross?.title, reason: rec.reason, matchedInterests: rec.matchedInterests }
          : null,
        eventsApi: {
          basketballHits: feedBasketball.events.filter((event) => event.source === "athletics").length,
          ryanHits: feedRyan.events.filter((event) => event.source === "athletics").length,
          sample: sample
            ? {
                title: sample.title,
                source: sample.source,
                sport: sample.sport,
                opponent: sample.opponent,
                venue: sample.venueName,
                homeAway: sample.homeAway,
                ticketUrl: Boolean(sample.ticketUrl),
                broadcastUrl: Boolean(sample.broadcastUrl),
                eventUrl: Boolean(sample.eventUrl),
                uglyNulls: [sample.sport, sample.opponent, sample.venueName, sample.title].some((value) =>
                  value == null ? false : /undefined|null/i.test(String(value)),
                ),
              }
            : null,
        },
        realmAug29: {
          pinCount: pinsAug29.length,
          titles: pinsAug29.map((row) => row.pin.title),
          sources: [...new Set(pinsAug29.map((row) => row.pin.source))],
        },
        realmAug28FootballAwayDay: {
          pinCount: pinsAwayDay.length,
          athleticsTitles: pinsAwayDay.filter((row) => row.pin.source === "athletics").map((row) => row.pin.title),
        },
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
