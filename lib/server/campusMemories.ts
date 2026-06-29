import { resolveProfileAvatar } from "@/lib/avatarSource";
import {
  CAMPUS_LOCATION_KEYS,
  getCampusLocationPreset,
  isCampusLocationKey,
  type CampusLocationKey,
} from "@/lib/campusLocations";
import { formatPostedAgo } from "@/lib/realm/momentTime";
import { ApiError } from "@/lib/server/http";
import { normalizeQuadPostProofUrl } from "@/lib/server/quadPosts";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CAMPUS_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

type SupabaseErrorLike = { message?: string | null; code?: string | null } | null | undefined;

/**
 * True when the failure is "the campus_memories table/columns don't exist yet"
 * (migration not applied in this environment). We degrade gracefully instead of
 * surfacing a 500 so the Quad feed keeps rendering until the migration runs.
 */
function isMissingCampusMemoriesTableError(error: SupabaseErrorLike): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
}

function logCampusMemoriesError(code: string, error: unknown) {
  const err = error as SupabaseErrorLike;
  console.error(
    `[campus-memories] ${code}`,
    JSON.stringify({ code: err?.code ?? null, message: err?.message ?? String(error) }),
  );
}

export type CampusMemoryMediaType = "text" | "image" | "video";
export type CampusMemoryVisibility = "public" | "friends" | "campus";

export type CampusMemoryApiRow = {
  id: string;
  userId: string;
  locationKey: string;
  locationName: string;
  eventId: string | null;
  mediaUrl: string | null;
  mediaType: CampusMemoryMediaType;
  body: string | null;
  visibility: CampusMemoryVisibility;
  expiresAt: string;
  savedToProfile: boolean;
  createdAt: string;
  updatedAt: string;
  username: string;
  displayName: string;
  authorAvatar: string;
  postedAgoLabel: string;
};

export type CampusMemoryGroupApiRow = {
  locationKey: string;
  locationName: string;
  count: number;
  latestCreatedAt: string;
  latestPreview: string | null;
  latestMediaType: CampusMemoryMediaType | null;
  hasRecent: boolean;
};

type CampusMemoryDbRow = {
  id: string;
  user_id: string;
  location_key: string;
  location_name: string;
  event_id: string | null;
  media_url: string | null;
  media_type: CampusMemoryMediaType;
  body: string | null;
  visibility: CampusMemoryVisibility;
  expires_at: string;
  saved_to_profile: boolean;
  created_at: string;
  updated_at: string;
  profiles:
    | {
        username: string;
        display_name: string;
        avatar_url: string | null;
        avatar_custom_json: string | null;
      }
    | {
        username: string;
        display_name: string;
        avatar_url: string | null;
        avatar_custom_json: string | null;
      }[]
    | null;
};

const MEMORY_SELECT = `
  id,
  user_id,
  location_key,
  location_name,
  event_id,
  media_url,
  media_type,
  body,
  visibility,
  expires_at,
  saved_to_profile,
  created_at,
  updated_at,
  profiles (
    username,
    display_name,
    avatar_url,
    avatar_custom_json
  )
`;

function profileFromRow(row: CampusMemoryDbRow) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
}

export function mapCampusMemoryRow(row: CampusMemoryDbRow, nowMs = Date.now()): CampusMemoryApiRow {
  const prof = profileFromRow(row);
  return {
    id: row.id,
    userId: row.user_id,
    locationKey: row.location_key,
    locationName: row.location_name,
    eventId: row.event_id,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    body: row.body,
    visibility: row.visibility,
    expiresAt: row.expires_at,
    savedToProfile: row.saved_to_profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    username: (prof?.username ?? "student").trim().toLowerCase(),
    displayName: (prof?.display_name ?? "Student").trim() || "Student",
    authorAvatar: resolveProfileAvatar(prof ?? undefined),
    postedAgoLabel: formatPostedAgo(row.created_at, nowMs),
  };
}

export function assertCampusMemoryLocation(
  locationKey: string,
  locationName?: string,
): { locationKey: CampusLocationKey; locationName: string } {
  const key = locationKey.trim();
  if (!isCampusLocationKey(key)) {
    throw new ApiError(400, "Invalid campus location.", "MEMORY_LOCATION_INVALID");
  }
  const preset = getCampusLocationPreset(key);
  const name = (locationName?.trim() || preset.label).slice(0, 200);
  return { locationKey: key, locationName: name };
}

export async function fetchCampusMemoryGroups(
  userClient: SupabaseClient,
): Promise<CampusMemoryGroupApiRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await userClient
    .from("campus_memories")
    .select("location_key, location_name, media_url, media_type, body, created_at")
    .gt("expires_at", nowIso)
    .in("visibility", ["public", "campus"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    // Table not deployed yet in this environment: degrade to "no memories" so the
    // Quad feed still renders. The migration self-heals this once applied.
    if (isMissingCampusMemoriesTableError(error)) {
      logCampusMemoriesError("CAMPUS_MEMORIES_GROUPS_TABLE_NOT_READY", error);
      return [];
    }
    logCampusMemoriesError("CAMPUS_MEMORIES_GROUPS_FAILED", error);
    throw new ApiError(500, "Could not load campus memories.", "CAMPUS_MEMORIES_GROUPS_FAILED");
  }

  const grouped = new Map<string, CampusMemoryGroupApiRow>();
  const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    const key = typeof row.location_key === "string" ? row.location_key.trim() : "";
    const name = typeof row.location_name === "string" ? row.location_name.trim() : "";
    // Skip malformed rows instead of letting them crash the grouping.
    if (!key || !name) continue;
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (!createdAt) continue;

    const existing = grouped.get(key);
    const preview =
      row.media_type === "image" && row.media_url
        ? row.media_url
        : (row.body?.trim().slice(0, 80) || null);
    const createdMs = Date.parse(createdAt);
    const isRecent = Number.isFinite(createdMs) && createdMs >= recentCutoff;
    if (!existing) {
      grouped.set(key, {
        locationKey: key,
        locationName: name,
        count: 1,
        latestCreatedAt: createdAt,
        latestPreview: preview,
        latestMediaType: (row.media_type as CampusMemoryMediaType) ?? null,
        hasRecent: isRecent,
      });
      continue;
    }
    existing.count += 1;
    if (isRecent) existing.hasRecent = true;
  }

  const order = new Map(CAMPUS_LOCATION_KEYS.map((k, i) => [k, i]));
  return Array.from(grouped.values()).sort((a, b) => {
    const ao = order.get(a.locationKey as CampusLocationKey) ?? 99;
    const bo = order.get(b.locationKey as CampusLocationKey) ?? 99;
    if (ao !== bo) return ao - bo;
    return b.count - a.count;
  });
}

export async function fetchCampusMemoriesByLocation(args: {
  userClient: SupabaseClient;
  locationKey: string;
  limit?: number;
}): Promise<CampusMemoryApiRow[]> {
  const limit = Math.min(60, Math.max(1, args.limit ?? 30));
  const nowIso = new Date().toISOString();

  const { data, error } = await args.userClient
    .from("campus_memories")
    .select(MEMORY_SELECT)
    .eq("location_key", args.locationKey.trim())
    .gt("expires_at", nowIso)
    .in("visibility", ["public", "campus"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new ApiError(500, "Could not load memories for this location.", "CAMPUS_MEMORIES_FETCH_FAILED");
  }

  return (data as CampusMemoryDbRow[]).map((row) => mapCampusMemoryRow(row));
}

export async function fetchSavedCampusMemoriesForUser(args: {
  userClient: SupabaseClient;
  userId: string;
  limit?: number;
}): Promise<CampusMemoryApiRow[]> {
  const limit = Math.min(40, Math.max(1, args.limit ?? 20));
  const { data, error } = await args.userClient
    .from("campus_memories")
    .select(MEMORY_SELECT)
    .eq("user_id", args.userId)
    .eq("saved_to_profile", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new ApiError(500, "Could not load saved memories.", "CAMPUS_MEMORIES_SAVED_FAILED");
  }

  return (data as CampusMemoryDbRow[]).map((row) => mapCampusMemoryRow(row));
}

export async function createCampusMemory(args: {
  userClient: SupabaseClient;
  userId: string;
  locationKey: string;
  locationName?: string;
  eventId?: string | null;
  mediaUrl?: string | null;
  mediaType: CampusMemoryMediaType;
  body?: string | null;
  visibility?: CampusMemoryVisibility;
}): Promise<CampusMemoryApiRow> {
  const { locationKey, locationName } = assertCampusMemoryLocation(args.locationKey, args.locationName);
  const body = args.body?.trim().slice(0, 500) ?? null;
  const mediaUrl = args.mediaUrl?.trim().slice(0, 2048) ?? null;
  const mediaType = args.mediaType;

  if (mediaType === "text" && !body) {
    throw new ApiError(400, "Add text for a text Memory.", "MEMORY_BODY_REQUIRED");
  }
  if ((mediaType === "image" || mediaType === "video") && !mediaUrl) {
    throw new ApiError(400, "Upload media before creating this Memory.", "MEMORY_MEDIA_REQUIRED");
  }

  const expiresAt = new Date(Date.now() + CAMPUS_MEMORY_TTL_MS).toISOString();

  const { data, error } = await args.userClient
    .from("campus_memories")
    .insert({
      user_id: args.userId,
      location_key: locationKey,
      location_name: locationName,
      event_id: args.eventId ?? null,
      media_url: mediaUrl,
      media_type: mediaType,
      body,
      visibility: args.visibility ?? "public",
      expires_at: expiresAt,
    })
    .select(MEMORY_SELECT)
    .single();

  if (error || !data) {
    throw new ApiError(500, "Could not create campus Memory.", "CAMPUS_MEMORY_CREATE_FAILED");
  }

  return mapCampusMemoryRow(data as CampusMemoryDbRow);
}

export async function patchCampusMemory(args: {
  userClient: SupabaseClient;
  memoryId: string;
  userId: string;
  savedToProfile?: boolean;
}): Promise<CampusMemoryApiRow> {
  const patch: Record<string, unknown> = {};
  if (args.savedToProfile !== undefined) patch.saved_to_profile = args.savedToProfile;

  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "No fields to update.", "MEMORY_PATCH_EMPTY");
  }

  const { data, error } = await args.userClient
    .from("campus_memories")
    .update(patch)
    .eq("id", args.memoryId)
    .eq("user_id", args.userId)
    .select(MEMORY_SELECT)
    .single();

  if (error || !data) {
    throw new ApiError(404, "Memory not found.", "CAMPUS_MEMORY_NOT_FOUND");
  }

  return mapCampusMemoryRow(data as CampusMemoryDbRow);
}

export async function deleteCampusMemory(args: {
  userClient: SupabaseClient;
  memoryId: string;
  userId: string;
}): Promise<void> {
  const { error, count } = await args.userClient
    .from("campus_memories")
    .delete({ count: "exact" })
    .eq("id", args.memoryId)
    .eq("user_id", args.userId);

  if (error) {
    throw new ApiError(500, "Could not delete Memory.", "CAMPUS_MEMORY_DELETE_FAILED");
  }
  if (!count) {
    throw new ApiError(404, "Memory not found.", "CAMPUS_MEMORY_NOT_FOUND");
  }
}

export async function normalizeCampusMemoryMediaUrl(
  mediaUrl: string | null | undefined,
  userId: string,
): Promise<string | null> {
  return normalizeQuadPostProofUrl(mediaUrl, userId);
}
