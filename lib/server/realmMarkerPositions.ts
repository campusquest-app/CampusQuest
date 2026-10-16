import type { SupabaseClient } from "@supabase/supabase-js";
import { clearCampusLocationCatalogCache } from "@/lib/locations/campusLocationCatalog";
import { realmMapPercentToGeo } from "@/lib/realm/geoToMapPercent";
import type { MarkerPosition, MarkerPositionMap } from "@/lib/realm/markerPositionsStore";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

/** config_key row for Realm map marker coordinates (% of map view). */
export const MARKER_POSITIONS_CONFIG_KEY = "marker_positions";

export type RealmConfigRow = {
  config_key: string;
  config_value: Record<string, { x: number; y: number; lat?: number; lng?: number }>;
  updated_at: string;
  updated_by: string | null;
};

export function isMissingRealmConfigTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /Could not find the table|schema cache/i.test(msg) && /campus_realm_config/i.test(msg);
}

function sanitizePositions(input: Record<string, { x: number; y: number; lat?: number; lng?: number }>): MarkerPositionMap {
  const out: MarkerPositionMap = {};
  for (const [id, pos] of Object.entries(input)) {
    if (!/^[a-z0-9-]{2,64}$/.test(id)) continue;
    if (typeof pos?.x !== "number" || typeof pos?.y !== "number") continue;
    const x = Math.min(100, Math.max(0, pos.x));
    const y = Math.min(100, Math.max(0, pos.y));
    const sanitized: MarkerPositionMap[string] = {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
    if (
      typeof pos.lat === "number" &&
      typeof pos.lng === "number" &&
      pos.lat >= -90 &&
      pos.lat <= 90 &&
      pos.lng >= -180 &&
      pos.lng <= 180
    ) {
      sanitized.lat = Math.round(pos.lat * 1_000_000) / 1_000_000;
      sanitized.lng = Math.round(pos.lng * 1_000_000) / 1_000_000;
    }
    out[id] = sanitized;
  }
  return out;
}

export async function fetchRealmMarkerPositions(
  client: SupabaseClient,
  configKey: string = MARKER_POSITIONS_CONFIG_KEY,
): Promise<{ positions: MarkerPositionMap; updatedAt: string | null; updatedBy: string | null }> {
  const { data, error } = await client
    .from("campus_realm_config")
    .select("config_value, updated_at, updated_by")
    .eq("config_key", configKey)
    .maybeSingle();

  if (error) {
    if (isMissingRealmConfigTableError(error)) {
      return { positions: {}, updatedAt: null, updatedBy: null };
    }
    throw new ApiError(400, error.message, "REALM_MARKER_POSITIONS_FETCH_FAILED");
  }

  const raw = (data as RealmConfigRow | null)?.config_value ?? {};
  return {
    positions: sanitizePositions(raw),
    updatedAt: (data as RealmConfigRow | null)?.updated_at ?? null,
    updatedBy: (data as RealmConfigRow | null)?.updated_by ?? null,
  };
}

export async function saveRealmMarkerPositions(args: {
  positions: MarkerPositionMap;
  updatedBy: string;
  configKey?: string;
}): Promise<{ positions: MarkerPositionMap; updatedAt: string; updatedBy: string }> {
  const configKey = args.configKey ?? MARKER_POSITIONS_CONFIG_KEY;
  const sanitized = sanitizePositions(args.positions as Record<string, { x: number; y: number; lat?: number; lng?: number }>);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("campus_realm_config")
    .upsert(
      {
        config_key: configKey,
        config_value: sanitized,
        updated_by: args.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" },
    )
    .select("config_value, updated_at, updated_by")
    .single();

  if (error) {
    if (isMissingRealmConfigTableError(error)) {
      throw new ApiError(
        503,
        "Realm map config is not set up on this database yet. Run supabase db push (migration campus_realm_config), then try again.",
        "REALM_CONFIG_TABLE_NOT_READY",
      );
    }
    throw new ApiError(400, error.message, "REALM_MARKER_POSITIONS_SAVE_FAILED");
  }

  try {
    await persistCampusLocationGeoFromMarkerPositions(sanitized);
  } catch (err) {
    console.warn("[cq:realm-markers] campus_locations geo persist threw", err);
  }

  const row = data as RealmConfigRow;
  return {
    positions: sanitizePositions(row.config_value ?? {}),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? args.updatedBy,
  };
}

/** Map-percent / geo payload that Edit Map must persist onto campus_locations. */
export function campusLocationGeoFromMarkerPosition(pos: MarkerPosition): {
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
} {
  const geo =
    typeof pos.lat === "number" && typeof pos.lng === "number"
      ? { latitude: pos.lat, longitude: pos.lng }
      : realmMapPercentToGeo(pos.x, pos.y);
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    mapX: pos.x,
    mapY: pos.y,
  };
}

/**
 * Write Edit Map coordinates onto campus_locations so event resolution and
 * future syncs use the admin-corrected place, not stale seed/import coords.
 */
export async function persistCampusLocationGeoFromMarkerPositions(
  positions: MarkerPositionMap,
): Promise<{ updated: string[]; skipped: string[] }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [slug, pos] of Object.entries(positions)) {
    const geo = campusLocationGeoFromMarkerPosition(pos);
    const { data, error } = await admin
      .from("campus_locations")
      .update({
        latitude: geo.latitude,
        longitude: geo.longitude,
        map_x: geo.mapX,
        map_y: geo.mapY,
        manually_adjusted: true,
        updated_at: now,
      })
      .eq("slug", slug)
      .select("slug")
      .maybeSingle();

    if (error || !data) {
      skipped.push(slug);
      if (error) {
        console.warn("[cq:realm-markers] campus_locations geo persist failed", {
          slug,
          message: error.message,
        });
      }
      continue;
    }
    updated.push(slug);
  }

  if (updated.length > 0) {
    clearCampusLocationCatalogCache();
  }
  return { updated, skipped };
}

/** Dev/diagnostic: verify table readable and admin upsert round-trip. */
export async function testRealmMarkerPositionsSave(updatedBy: string): Promise<{
  ok: boolean;
  positions: MarkerPositionMap;
}> {
  const current = await fetchRealmMarkerPositions(createAdminClient());
  const saved = await saveRealmMarkerPositions({
    positions: current.positions,
    updatedBy,
  });
  return { ok: true, positions: saved.positions };
}
