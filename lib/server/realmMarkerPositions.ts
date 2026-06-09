import type { SupabaseClient } from "@supabase/supabase-js";
import { REALM_LOCATION_OPTIONS, type RealmLocationId } from "@/lib/realm/locations";
import type { MarkerPositionMap } from "@/lib/realm/markerPositionsStore";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

/** config_key row for Realm map marker coordinates (% of map view). */
export const MARKER_POSITIONS_CONFIG_KEY = "marker_positions";

const VALID_LOCATION_IDS = new Set<string>(REALM_LOCATION_OPTIONS.map((l) => l.id));

export type RealmConfigRow = {
  config_key: string;
  config_value: Record<string, { x: number; y: number }>;
  updated_at: string;
  updated_by: string | null;
};

export function isMissingRealmConfigTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /Could not find the table|schema cache/i.test(msg) && /campus_realm_config/i.test(msg);
}

function sanitizePositions(input: Record<string, { x: number; y: number }>): MarkerPositionMap {
  const out: MarkerPositionMap = {};
  for (const [id, pos] of Object.entries(input)) {
    if (!VALID_LOCATION_IDS.has(id)) continue;
    if (typeof pos?.x !== "number" || typeof pos?.y !== "number") continue;
    const x = Math.min(100, Math.max(0, pos.x));
    const y = Math.min(100, Math.max(0, pos.y));
    out[id as RealmLocationId] = {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
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
  const sanitized = sanitizePositions(args.positions as Record<string, { x: number; y: number }>);
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

  const row = data as RealmConfigRow;
  return {
    positions: sanitizePositions(row.config_value ?? {}),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? args.updatedBy,
  };
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
