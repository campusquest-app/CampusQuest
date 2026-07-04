import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampusLocationKey } from "@/lib/campusLocations";
import {
  clearCampusLocationCatalogCache,
  setCampusLocationCatalogCache,
  type CampusLocationRecord,
} from "@/lib/locations/campusLocationCatalog";
import { dedupeLocationSlug, normalizeLocationSlug } from "@/lib/locations/normalizeLocationSlug";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

const IS_DEV = process.env.NODE_ENV !== "production";

function logCampusLocation(stage: string, payload: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][campus-locations] ${stage}`, payload);
}

type DbRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  latitude: number | null;
  longitude: number | null;
  map_x: number | null;
  map_y: number | null;
  marker_emoji: string | null;
  short_label: string | null;
  fantasy_name: string | null;
  flavor_text: string | null;
  major: boolean;
  legacy_campus_key: string | null;
  sort_order: number;
  is_builtin: boolean;
  is_active: boolean;
};

function mapRow(row: DbRow): CampusLocationRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    mapX: row.map_x,
    mapY: row.map_y,
    markerEmoji: row.marker_emoji ?? "📍",
    shortLabel: row.short_label ?? row.name,
    fantasyName: row.fantasy_name ?? row.name,
    flavorText: row.flavor_text ?? row.description ?? "",
    major: row.major,
    legacyCampusKey: (row.legacy_campus_key as CampusLocationKey | null) ?? null,
    sortOrder: row.sort_order,
    isBuiltin: row.is_builtin,
    isActive: row.is_active,
  };
}

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /campus_locations/i.test(msg) && /(schema cache|could not find|does not exist)/i.test(msg);
}

const SELECT_COLS =
  "id, slug, name, description, category, latitude, longitude, map_x, map_y, marker_emoji, short_label, fantasy_name, flavor_text, major, legacy_campus_key, sort_order, is_builtin, is_active";

export async function getCampusLocations(args?: {
  client?: SupabaseClient;
  includeInactive?: boolean;
  refreshCache?: boolean;
}): Promise<CampusLocationRecord[]> {
  const client = args?.client ?? createAdminClient();
  const { data, error } = await client
    .from("campus_locations")
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      logCampusLocation("table_missing", { message: error.message });
      return [];
    }
    logCampusLocation("fetch_failed", { message: error.message, code: error.code });
    throw new ApiError(400, error.message, "CAMPUS_LOCATIONS_FETCH_FAILED");
  }

  let rows = (data ?? []).map((row) => mapRow(row as DbRow));
  if (!args?.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (args?.refreshCache !== false && rows.length > 0) {
    setCampusLocationCatalogCache(rows);
  }

  return rows;
}

export async function getCampusLocationBySlug(
  slug: string,
  client?: SupabaseClient,
): Promise<CampusLocationRecord | null> {
  const db = client ?? createAdminClient();
  const { data, error } = await db.from("campus_locations").select(SELECT_COLS).eq("slug", slug).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new ApiError(400, error.message, "CAMPUS_LOCATION_LOOKUP_FAILED");
  }
  return data ? mapRow(data as DbRow) : null;
}

export async function createCampusLocation(args: {
  name: string;
  description?: string;
  category?: string;
  latitude?: number | null;
  longitude?: number | null;
  mapX?: number | null;
  mapY?: number | null;
  markerEmoji?: string;
  shortLabel?: string;
  fantasyName?: string;
  flavorText?: string;
  major?: boolean;
  legacyCampusKey?: CampusLocationKey | null;
  createdBy: string;
  slug?: string;
}): Promise<CampusLocationRecord> {
  const admin = createAdminClient();
  const existing = await getCampusLocations({ client: admin, includeInactive: true, refreshCache: false });
  const takenSlugs = new Set(existing.map((row) => row.slug));
  const takenNames = new Set(existing.map((row) => row.name.trim().toLowerCase()));

  const trimmedName = args.name.trim();
  if (!trimmedName) {
    throw new ApiError(400, "Location name is required.", "CAMPUS_LOCATION_NAME_REQUIRED");
  }
  if (takenNames.has(trimmedName.toLowerCase())) {
    logCampusLocation("duplicate_name", { name: trimmedName });
    throw new ApiError(409, "A location with this name already exists.", "CAMPUS_LOCATION_DUPLICATE");
  }

  const slug = args.slug
    ? normalizeLocationSlug(args.slug)
    : dedupeLocationSlug(trimmedName, takenSlugs);

  if (takenSlugs.has(slug)) {
    logCampusLocation("duplicate_slug", { slug, name: trimmedName });
    throw new ApiError(409, "A location with this slug already exists.", "CAMPUS_LOCATION_DUPLICATE");
  }

  if (args.mapX == null || args.mapY == null) {
    logCampusLocation("missing_map_coords", { slug, name: trimmedName });
  }

  const sortOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 0;

  const { data, error } = await admin
    .from("campus_locations")
    .insert({
      slug,
      name: trimmedName,
      description: args.description?.trim() ?? "",
      category: args.category ?? "building",
      latitude: args.latitude ?? null,
      longitude: args.longitude ?? null,
      map_x: args.mapX ?? null,
      map_y: args.mapY ?? null,
      marker_emoji: args.markerEmoji ?? "📍",
      short_label: args.shortLabel ?? trimmedName.split(" ").slice(0, 2).join(" "),
      fantasy_name: args.fantasyName ?? trimmedName,
      flavor_text: args.flavorText ?? "",
      major: args.major ?? true,
      legacy_campus_key: args.legacyCampusKey ?? null,
      sort_order: sortOrder,
      is_builtin: false,
      is_active: true,
      created_by: args.createdBy,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "A location with this name or slug already exists.", "CAMPUS_LOCATION_DUPLICATE");
    }
    logCampusLocation("create_failed", { message: error.message, slug });
    throw new ApiError(400, error.message, "CAMPUS_LOCATION_CREATE_FAILED");
  }

  clearCampusLocationCatalogCache();
  await getCampusLocations({ client: admin, includeInactive: true, refreshCache: true });
  logCampusLocation("created", { slug, name: trimmedName, id: data.id });
  return mapRow(data as DbRow);
}

export async function updateCampusLocation(args: {
  slug: string;
  patch: Partial<{
    name: string;
    description: string;
    latitude: number | null;
    longitude: number | null;
    mapX: number | null;
    mapY: number | null;
    markerEmoji: string;
    shortLabel: string;
    isActive: boolean;
  }>;
}): Promise<CampusLocationRecord> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const p = args.patch;
  if (p.name != null) patch.name = p.name.trim();
  if (p.description != null) patch.description = p.description.trim();
  if (p.latitude !== undefined) patch.latitude = p.latitude;
  if (p.longitude !== undefined) patch.longitude = p.longitude;
  if (p.mapX !== undefined) patch.map_x = p.mapX;
  if (p.mapY !== undefined) patch.map_y = p.mapY;
  if (p.markerEmoji != null) patch.marker_emoji = p.markerEmoji;
  if (p.shortLabel != null) patch.short_label = p.shortLabel;
  if (p.isActive != null) patch.is_active = p.isActive;

  const { data, error } = await admin
    .from("campus_locations")
    .update(patch)
    .eq("slug", args.slug)
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    logCampusLocation("update_failed", { slug: args.slug, message: error?.message });
    throw new ApiError(error ? 400 : 404, error?.message ?? "Location not found.", "CAMPUS_LOCATION_UPDATE_FAILED");
  }

  clearCampusLocationCatalogCache();
  await getCampusLocations({ client: admin, includeInactive: true, refreshCache: true });
  return mapRow(data as DbRow);
}

/** Create or update a campus location from an admin map marker placement. */
export async function ensureLocationExistsFromMarker(args: {
  name: string;
  mapX: number;
  mapY: number;
  latitude?: number | null;
  longitude?: number | null;
  createdBy: string;
  slug?: string;
}): Promise<CampusLocationRecord> {
  const admin = createAdminClient();
  const slugCandidate = normalizeLocationSlug(args.slug ?? args.name);
  const existing = await getCampusLocationBySlug(slugCandidate, admin);
  if (existing) {
    return updateCampusLocation({
      slug: existing.slug,
      patch: {
        mapX: args.mapX,
        mapY: args.mapY,
        latitude: args.latitude ?? existing.latitude,
        longitude: args.longitude ?? existing.longitude,
      },
    });
  }

  return createCampusLocation({
    name: args.name,
    mapX: args.mapX,
    mapY: args.mapY,
    latitude: args.latitude,
    longitude: args.longitude,
    createdBy: args.createdBy,
    slug: slugCandidate,
  });
}

export { normalizeLocationSlug } from "@/lib/locations/normalizeLocationSlug";
