import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  canonicalVenueCoordinates,
  resolveUriCanonicalVenue,
} from "../lib/locations/uriVenueAliases";
import { haversineMeters } from "../lib/server/urinvolved/coordinateSanity";

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

type EventRow = {
  id: string;
  title: string | null;
  source: string | null;
  venue_name: string | null;
  location_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  starts_at: string | null;
  is_active: boolean | null;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("AUDIT_SKIPPED_NO_SUPABASE_ENV");
    return;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("external_events")
    .select("id, title, source, venue_name, location_name, address, latitude, longitude, starts_at, is_active")
    .eq("is_active", true)
    .gte("starts_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .lte("starts_at", new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(400);

  if (error) {
    console.error("AUDIT_QUERY_FAILED", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as EventRow[];
  const mismatches: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const sourceText =
      row.venue_name?.trim() || row.location_name?.trim() || row.address?.trim() || "";
    if (!sourceText) continue;
    const venue = resolveUriCanonicalVenue(sourceText);
    const canonical = venue ? canonicalVenueCoordinates(venue.venue) : null;
    if (!canonical) continue;
    if (row.latitude == null || row.longitude == null) {
      mismatches.push({
        event: row.title,
        source: row.source,
        sourceLocationText: sourceText,
        currentCoords: null,
        canonicalPlace: venue!.venue.name,
        distanceMismatchMeters: null,
        finalResolution: "canonical_place_no_source_coords",
      });
      continue;
    }
    const distance = haversineMeters(
      { latitude: Number(row.latitude), longitude: Number(row.longitude) },
      canonical,
    );
    if (distance > 30) {
      mismatches.push({
        event: row.title,
        source: row.source,
        sourceLocationText: sourceText,
        currentCoords: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
        canonicalPlace: venue!.venue.name,
        distanceMismatchMeters: Math.round(distance),
        finalResolution: "canonical_override",
      });
    }
  }

  const { data: keeneyRows, error: keeneyError } = await admin
    .from("external_events")
    .select("id, title, source, venue_name, location_name, address, latitude, longitude, starts_at, is_active")
    .or(
      "venue_name.ilike.%keeney%,venue_name.ilike.%keaney%,location_name.ilike.%keeney%,location_name.ilike.%keaney%,address.ilike.%keeney%,address.ilike.%keaney%",
    )
    .order("starts_at", { ascending: false })
    .limit(50);

  if (keeneyError) {
    console.error("KEENEY_QUERY_FAILED", keeneyError.message);
    process.exit(1);
  }

  const keeney = ((keeneyRows ?? []) as EventRow[]).map((row) => {
    const sourceText =
      row.venue_name?.trim() || row.location_name?.trim() || row.address?.trim() || "";
    const venue = resolveUriCanonicalVenue(sourceText);
    const canonical = venue ? canonicalVenueCoordinates(venue.venue) : null;
    const distance =
      canonical && row.latitude != null && row.longitude != null
        ? Math.round(
            haversineMeters(
              { latitude: Number(row.latitude), longitude: Number(row.longitude) },
              canonical,
            ),
          )
        : null;
    return {
      event: row.title,
      source: row.source,
      sourceLocationText: sourceText,
      currentCoords:
        row.latitude == null || row.longitude == null
          ? null
          : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
      canonicalPlace: venue?.venue.name ?? null,
      distanceMismatchMeters: distance,
      finalResolution: venue ? "canonical_override_or_match" : "unresolved",
      startsAt: row.starts_at,
      isActive: row.is_active,
    };
  });

  console.log(JSON.stringify({ scanned: rows.length, mismatches, keeney }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
