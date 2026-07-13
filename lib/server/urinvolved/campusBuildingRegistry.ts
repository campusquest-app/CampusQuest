import { dedupeLocationSlug, normalizeLocationSlug } from "@/lib/locations/normalizeLocationSlug";
import {
  buildingNameForDisplay,
  extractBuildingName,
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";
import { createAdminClient } from "@/lib/server/supabase";
import type { GoogleGeocodeResult } from "@/lib/server/geocoding/googleCampusGeocoder";

export type CampusBuildingRegistryEntry = {
  slug: string;
  canonicalName: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  formattedAddress: string | null;
  verified: boolean;
  geocodeSource: string | null;
  updatedAt: string;
};

type DbRow = {
  slug: string;
  name: string;
  aliases: string[] | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  formatted_address: string | null;
  verified: boolean;
  geocode_source: string | null;
  updated_at: string;
};

const SELECT_COLS =
  "slug, name, aliases, latitude, longitude, google_place_id, formatted_address, verified, geocode_source, updated_at";

function mapRow(row: DbRow): CampusBuildingRegistryEntry | null {
  if (row.latitude == null || row.longitude == null) return null;
  return {
    slug: row.slug,
    canonicalName: row.name,
    aliases: row.aliases ?? [],
    latitude: row.latitude,
    longitude: row.longitude,
    googlePlaceId: row.google_place_id,
    formattedAddress: row.formatted_address,
    verified: row.verified,
    geocodeSource: row.geocode_source,
    updatedAt: row.updated_at,
  };
}

export async function loadCampusBuildingRegistry(): Promise<CampusBuildingRegistryEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campus_locations")
    .select(SELECT_COLS)
    .eq("is_active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    console.warn("[cq:building-registry] load failed", error.message);
    return [];
  }

  return (data as DbRow[]).map(mapRow).filter((row): row is CampusBuildingRegistryEntry => row !== null);
}

export function matchBuildingRegistryEntry(
  locationText: string,
  registry: CampusBuildingRegistryEntry[],
): CampusBuildingRegistryEntry | null {
  const building = extractBuildingName(locationText);
  if (!building) return null;

  let best: { entry: CampusBuildingRegistryEntry; score: number } | null = null;

  for (const entry of registry) {
    const candidates = [
      normalizeCampusLocationName(entry.canonicalName),
      normalizeCampusLocationName(entry.slug.replace(/-/g, " ")),
      ...entry.aliases.map((alias) => normalizeCampusLocationName(alias)),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate === building) {
        const score = entry.verified ? 1 : 0.95;
        if (!best || score > best.score) best = { entry, score };
        continue;
      }
      if (
        candidate.length >= 6 &&
        (building.includes(candidate) || candidate.includes(building))
      ) {
        const score = (entry.verified ? 0.94 : 0.88) * (candidate.length / Math.max(candidate.length, building.length));
        if (!best || score > best.score) best = { entry, score };
      }
    }
  }

  return best?.entry ?? null;
}

export async function upsertBuildingFromGeocode(args: {
  buildingName: string;
  geocode: GoogleGeocodeResult;
  sourceText?: string;
  verified?: boolean;
  updatedBy?: string | null;
}): Promise<CampusBuildingRegistryEntry | null> {
  const admin = createAdminClient();
  const normalized = normalizeCampusLocationName(args.buildingName);
  const canonicalName = buildingNameForDisplay(normalized);
  const existing = await loadCampusBuildingRegistry();
  const takenSlugs = new Set(existing.map((row) => row.slug));

  const direct = matchBuildingRegistryEntry(canonicalName, existing);
  const slug = direct?.slug ?? dedupeLocationSlug(normalizeLocationSlug(canonicalName), takenSlugs);

  const aliasSet = new Set<string>();
  if (args.sourceText) aliasSet.add(normalizeCampusLocationName(args.sourceText));
  aliasSet.add(normalized);
  if (direct) {
    for (const alias of direct.aliases) aliasSet.add(normalizeCampusLocationName(alias));
  }
  aliasSet.delete(normalizeCampusLocationName(canonicalName));

  const existingRow = existing.find((row) => row.slug === slug);
  if (existingRow?.verified && !args.verified) {
    return existingRow;
  }

  // Never overwrite coordinates an admin dragged to a verified position.
  const { data: manualRow } = await admin
    .from("campus_locations")
    .select("manually_adjusted, latitude, longitude")
    .eq("slug", slug)
    .maybeSingle();

  if (manualRow?.manually_adjusted && manualRow.latitude != null && manualRow.longitude != null) {
    const kept = existing.find((row) => row.slug === slug);
    if (kept) return kept;
  }

  const aliases = Array.from(aliasSet).filter(Boolean);
  const now = new Date().toISOString();
  const row = {
    slug,
    name: canonicalName,
    aliases,
    latitude: args.geocode.latitude,
    longitude: args.geocode.longitude,
    google_place_id: args.geocode.placeId,
    formatted_address: args.geocode.formattedAddress,
    verified: args.verified ?? existingRow?.verified ?? false,
    geocode_source: "google",
    is_active: true,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("campus_locations")
    .upsert(row, { onConflict: "slug" })
    .select(SELECT_COLS)
    .single();

  if (error) {
    console.warn("[cq:building-registry] upsert failed", { slug, message: error.message });
    return null;
  }

  return mapRow(data as DbRow);
}

export async function markBuildingRegistryVerified(slug: string): Promise<CampusBuildingRegistryEntry | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("campus_locations")
    .update({ verified: true, updated_at: now })
    .eq("slug", slug)
    .select(SELECT_COLS)
    .single();

  if (error) {
    console.warn("[cq:building-registry] verify failed", { slug, message: error.message });
    return null;
  }
  return mapRow(data as DbRow);
}
