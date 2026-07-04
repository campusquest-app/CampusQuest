import { resolveProfileAvatar } from "@/lib/avatarSource";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import {
  campusLocationIdFromLegacyKey,
  getCampusLocationName,
  isCampusLocationId,
  legacyCampusKeyFromLocationId,
  sortMemoryGroups,
  type CampusLocationId,
} from "@/lib/locations/campusLocationCatalog";
import { formatPostedAgo } from "@/lib/realm/momentTime";
import { ApiError } from "@/lib/server/http";
import { normalizeQuadPostProofUrl } from "@/lib/server/quadPosts";
import { loadCampusMemoryReactionMeta, type CampusMemoryReactionMeta } from "@/lib/server/campusMemoryReactions";
import type { CampusMemoryArchiveSection, CampusMemoryLocationStats } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CAMPUS_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

type SupabaseErrorLike = { message?: string | null; code?: string | null } | null | undefined;

function isMissingCampusMemoriesTableError(error: SupabaseErrorLike): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find");
}

function logCampusMemoriesError(code: string, error: unknown) {
  const err = error as (SupabaseErrorLike & { details?: string | null; hint?: string | null }) | undefined;
  const IS_DEV = process.env.NODE_ENV !== "production";
  console.error(
    `[campus-memories] ${code}`,
    JSON.stringify({
      code: err?.code ?? null,
      message: err?.message ?? String(error),
      details: err?.details ?? null,
      hint: err?.hint ?? null,
    }),
  );
  if (IS_DEV && error instanceof Error && error.stack) {
    console.error(`[campus-memories] ${code} stack`, error.stack);
  }
}

/** Map a Postgres/PostgREST insert error to a descriptive, client-safe ApiError shape. */
function classifyCampusMemoryInsertError(error: SupabaseErrorLike): {
  status: number;
  message: string;
  code: string;
} {
  if (isMissingCampusMemoriesTableError(error)) {
    return {
      status: 503,
      message: "Campus Memories aren't available yet. Please try again shortly.",
      code: "CAMPUS_MEMORIES_TABLE_NOT_READY",
    };
  }
  const pgCode = error?.code ?? "";
  if (pgCode === "42501") {
    return {
      status: 403,
      message: "You don't have permission to post this Memory.",
      code: "CAMPUS_MEMORY_RLS_DENIED",
    };
  }
  if (pgCode === "23503") {
    return {
      status: 400,
      message: "That location or event is no longer available.",
      code: "CAMPUS_MEMORY_FK_INVALID",
    };
  }
  if (pgCode === "23502" || pgCode === "23514") {
    return {
      status: 400,
      message: "Your Memory is missing a required field.",
      code: "CAMPUS_MEMORY_CONSTRAINT",
    };
  }
  return {
    status: 500,
    message: "Could not create campus Memory.",
    code: "CAMPUS_MEMORY_CREATE_FAILED",
  };
}

export type CampusMemoryMediaType = "text" | "image" | "video";
export type CampusMemoryVisibility = "public" | "friends" | "campus";

export type CampusMemoryApiRow = {
  id: string;
  userId: string;
  locationId: string;
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
  likeCount: number;
  likedByMe: boolean;
  starCount: number;
  starredByMe: boolean;
};

export type CampusMemoryGroupApiRow = {
  locationId: string;
  locationKey: string;
  locationName: string;
  count: number;
  latestCreatedAt: string;
  latestPreview: string | null;
  latestMediaType: CampusMemoryMediaType | null;
  latestAuthorAvatar: string | null;
  hasRecent: boolean;
};

type CampusMemoryDbRow = {
  id: string;
  user_id: string;
  location_id: string | null;
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
  location_id,
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

function resolveLocationId(row: Pick<CampusMemoryDbRow, "location_id" | "location_key">): CampusLocationId | null {
  const fromId = row.location_id?.trim();
  if (fromId && isCampusLocationId(fromId)) return fromId;
  return campusLocationIdFromLegacyKey(row.location_key);
}

export function mapCampusMemoryRow(
  row: CampusMemoryDbRow,
  nowMs = Date.now(),
  reactions?: CampusMemoryReactionMeta,
): CampusMemoryApiRow | null {
  const locationId = resolveLocationId(row);
  if (!locationId) return null;
  const prof = profileFromRow(row);
  const legacyKey = legacyCampusKeyFromLocationId(locationId) ?? row.location_key;
  return {
    id: row.id,
    userId: row.user_id,
    locationId,
    locationKey: legacyKey,
    locationName: row.location_name?.trim() || getCampusLocationName(locationId),
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
    likeCount: reactions?.likeCount ?? 0,
    likedByMe: reactions?.likedByMe ?? false,
    starCount: reactions?.starCount ?? 0,
    starredByMe: reactions?.starredByMe ?? false,
  };
}

export async function assertCampusMemoryLocation(args: {
  locationId?: string | null;
  locationKey?: string | null;
  locationName?: string;
}): Promise<{ locationId: CampusLocationId; locationKey: string; locationName: string }> {
  await getCampusLocations({ refreshCache: true });
  const locationId =
    (args.locationId && isCampusLocationId(args.locationId) ? args.locationId : null)
    ?? campusLocationIdFromLegacyKey(args.locationKey);
  if (!locationId) {
    throw new ApiError(400, "Invalid campus location.", "MEMORY_LOCATION_INVALID");
  }
  const legacyKey = legacyCampusKeyFromLocationId(locationId) ?? args.locationKey?.trim() ?? locationId;
  const name = (args.locationName?.trim() || getCampusLocationName(locationId)).slice(0, 200);
  return { locationId, locationKey: legacyKey, locationName: name };
}

export async function fetchCampusMemoryGroups(
  userClient: SupabaseClient,
): Promise<CampusMemoryGroupApiRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await userClient
    .from("campus_memories")
    .select("location_id, location_key, location_name, media_url, media_type, body, created_at, profiles(username, display_name, avatar_url, avatar_custom_json)")
    .gt("expires_at", nowIso)
    .in("visibility", ["public", "campus"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
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
    const locationId = resolveLocationId(row as CampusMemoryDbRow);
    if (!locationId) continue;
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (!createdAt) continue;

    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const authorAvatar = resolveProfileAvatar(prof ?? undefined);
    const preview =
      row.media_type === "image" && row.media_url
        ? row.media_url
        : (row.body?.trim().slice(0, 80) || null);
    const createdMs = Date.parse(createdAt);
    const isRecent = Number.isFinite(createdMs) && createdMs >= recentCutoff;
    const legacyKey = legacyCampusKeyFromLocationId(locationId) ?? row.location_key;

    const existing = grouped.get(locationId);
    if (!existing) {
      grouped.set(locationId, {
        locationId,
        locationKey: legacyKey,
        locationName: row.location_name?.trim() || getCampusLocationName(locationId),
        count: 1,
        latestCreatedAt: createdAt,
        latestPreview: preview,
        latestMediaType: (row.media_type as CampusMemoryMediaType) ?? null,
        latestAuthorAvatar: authorAvatar,
        hasRecent: isRecent,
      });
      continue;
    }
    existing.count += 1;
    if (isRecent) existing.hasRecent = true;
  }

  return sortMemoryGroups(
    Array.from(grouped.values()).map((g) => ({ ...g, locationId: g.locationId as CampusLocationId })),
  );
}

async function mergeEmptyLocationGroups(groups: CampusMemoryGroupApiRow[]): Promise<CampusMemoryGroupApiRow[]> {
  const catalog = await getCampusLocations({ refreshCache: true });
  const byId = new Map(groups.map((g) => [g.locationId, g]));
  for (const row of catalog) {
    if (byId.has(row.slug)) continue;
    byId.set(row.slug, {
      locationId: row.slug,
      locationKey: row.legacyCampusKey ?? row.slug,
      locationName: row.name,
      count: 0,
      latestCreatedAt: "",
      latestPreview: null,
      latestMediaType: null,
      latestAuthorAvatar: "",
      hasRecent: false,
    });
  }
  return sortMemoryGroups(Array.from(byId.values()).map((g) => ({ ...g, locationId: g.locationId as CampusLocationId })));
}

export async function fetchCampusMemoryGroupsWithEmptyLocations(
  userClient: SupabaseClient,
): Promise<CampusMemoryGroupApiRow[]> {
  const groups = await fetchCampusMemoryGroups(userClient);
  try {
    return await mergeEmptyLocationGroups(groups);
  } catch (err) {
    logCampusMemoriesError("CAMPUS_MEMORIES_EMPTY_GROUPS_FAILED", err);
    return groups;
  }
}

export async function fetchCampusMemoryLocationStats(
  userClient: SupabaseClient,
): Promise<CampusMemoryLocationStats[]> {
  const { data, error } = await userClient
    .from("campus_memories")
    .select("location_id, location_key, expires_at, saved_to_profile")
    .in("visibility", ["public", "campus"])
    .limit(2000);

  if (error) {
    if (isMissingCampusMemoriesTableError(error)) return [];
    logCampusMemoriesError("CAMPUS_MEMORIES_STATS_FAILED", error);
    throw new ApiError(500, "Could not load memory stats.", "CAMPUS_MEMORIES_STATS_FAILED");
  }

  const nowIso = new Date().toISOString();
  const catalog = await getCampusLocations({ refreshCache: true });
  const tallies = new Map<CampusLocationId, { active: number; archived: number; total: number }>();

  for (const row of catalog) {
    tallies.set(row.slug, { active: 0, archived: 0, total: 0 });
  }

  for (const row of data ?? []) {
    const locationId = resolveLocationId(row as CampusMemoryDbRow);
    if (!locationId) continue;
    const bucket = tallies.get(locationId) ?? { active: 0, archived: 0, total: 0 };
    bucket.total += 1;
    if (row.saved_to_profile) bucket.archived += 1;
    if (typeof row.expires_at === "string" && row.expires_at > nowIso) bucket.active += 1;
    tallies.set(locationId, bucket);
  }

  return catalog.map((row) => {
    const bucket = tallies.get(row.slug) ?? { active: 0, archived: 0, total: 0 };
    return {
      locationId: row.slug,
      locationName: row.name,
      activeCount: bucket.active,
      archivedCount: bucket.archived,
      totalCount: bucket.total,
    };
  });
}

export async function fetchCampusMemoriesByLocation(args: {
  userClient: SupabaseClient;
  locationId: string;
  includeExpired?: boolean;
  savedOnly?: boolean;
  limit?: number;
}): Promise<CampusMemoryApiRow[]> {
  const limit = Math.min(60, Math.max(1, args.limit ?? 30));
  const locationId = args.locationId.trim();
  await getCampusLocations({ refreshCache: true });
  if (!isCampusLocationId(locationId)) return [];

  let query = args.userClient
    .from("campus_memories")
    .select(MEMORY_SELECT)
    .in("visibility", ["public", "campus"]);

  if (args.savedOnly) {
    query = query.eq("saved_to_profile", true);
  } else if (!args.includeExpired) {
    query = query.gt("expires_at", new Date().toISOString());
  }

  const legacyKey = legacyCampusKeyFromLocationId(locationId);
  if (legacyKey) {
    query = query.or(`location_id.eq.${locationId},location_key.eq.${legacyKey}`);
  } else {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    throw new ApiError(500, "Could not load memories for this location.", "CAMPUS_MEMORIES_FETCH_FAILED");
  }

  return (data as CampusMemoryDbRow[])
    .map((row) => mapCampusMemoryRow(row))
    .filter((row): row is CampusMemoryApiRow => row !== null);
}

async function enrichMappedMemories(
  userClient: SupabaseClient,
  userId: string,
  rows: CampusMemoryDbRow[],
): Promise<CampusMemoryApiRow[]> {
  const mapped = rows
    .map((row) => mapCampusMemoryRow(row))
    .filter((row): row is CampusMemoryApiRow => row !== null);
  if (mapped.length === 0) return [];

  const reactionMeta = await loadCampusMemoryReactionMeta({
    userClient,
    userId,
    memoryIds: mapped.map((m) => m.id),
  });

  return mapped.map((memory) => {
    const reactions = reactionMeta.get(memory.id);
    if (!reactions) return memory;
    return {
      ...memory,
      likeCount: reactions.likeCount,
      likedByMe: reactions.likedByMe,
      starCount: reactions.starCount,
      starredByMe: reactions.starredByMe,
    };
  });
}

/** Active memories across campus or filtered to one location (newest first). */
export async function fetchCampusMemoriesFeed(args: {
  userClient: SupabaseClient;
  userId: string;
  locationId?: string | null;
  includeExpired?: boolean;
  limit?: number;
}): Promise<CampusMemoryApiRow[]> {
  const limit = Math.min(80, Math.max(1, args.limit ?? 40));

  let query = args.userClient
    .from("campus_memories")
    .select(MEMORY_SELECT)
    .in("visibility", ["public", "campus"]);

  if (!args.includeExpired) {
    query = query.gt("expires_at", new Date().toISOString());
  }

  const locationId = args.locationId?.trim();
  if (locationId && isCampusLocationId(locationId)) {
    const legacyKey = legacyCampusKeyFromLocationId(locationId);
    if (legacyKey) {
      query = query.or(`location_id.eq.${locationId},location_key.eq.${legacyKey}`);
    } else {
      query = query.eq("location_id", locationId);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    if (isMissingCampusMemoriesTableError(error)) return [];
    throw new ApiError(500, "Could not load campus memories.", "CAMPUS_MEMORIES_FEED_FAILED");
  }

  return enrichMappedMemories(args.userClient, args.userId, (data ?? []) as CampusMemoryDbRow[]);
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

  return (data as CampusMemoryDbRow[])
    .map((row) => mapCampusMemoryRow(row))
    .filter((row): row is CampusMemoryApiRow => row !== null);
}

export async function fetchCampusMemoryArchive(args: {
  userClient: SupabaseClient;
  userId?: string;
  limit?: number;
}): Promise<CampusMemoryArchiveSection[]> {
  const limit = Math.min(120, Math.max(1, args.limit ?? 60));
  let query = args.userClient
    .from("campus_memories")
    .select(MEMORY_SELECT)
    .eq("saved_to_profile", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args.userId) {
    query = query.eq("user_id", args.userId);
  } else {
    query = query.in("visibility", ["public", "campus"]);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "Could not load memory archive.", "CAMPUS_MEMORIES_ARCHIVE_FAILED");
  }

  const byLocation = new Map<string, CampusMemoryArchiveSection>();
  for (const row of data as CampusMemoryDbRow[]) {
    const mapped = mapCampusMemoryRow(row);
    if (!mapped) continue;
    const section = byLocation.get(mapped.locationId);
    if (!section) {
      byLocation.set(mapped.locationId, {
        locationId: mapped.locationId,
        locationName: mapped.locationName,
        memories: [mapped],
      });
    } else {
      section.memories.push(mapped);
    }
  }

  return Array.from(byLocation.values()).sort(
    (a, b) => getCampusLocationName(a.locationId as CampusLocationId).localeCompare(
      getCampusLocationName(b.locationId as CampusLocationId),
    ),
  );
}

export async function createCampusMemory(args: {
  userClient: SupabaseClient;
  userId: string;
  locationId?: string | null;
  locationKey?: string | null;
  locationName?: string;
  eventId?: string | null;
  mediaUrl?: string | null;
  mediaType: CampusMemoryMediaType;
  body?: string | null;
  visibility?: CampusMemoryVisibility;
}): Promise<CampusMemoryApiRow> {
  const { locationId, locationKey, locationName } = await assertCampusMemoryLocation(args);
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
      location_id: locationId,
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
    logCampusMemoriesError("CAMPUS_MEMORY_CREATE_FAILED", error);
    const { status, message, code } = classifyCampusMemoryInsertError(error);
    throw new ApiError(status, message, code);
  }

  const mapped = mapCampusMemoryRow(data as CampusMemoryDbRow);
  if (!mapped) {
    logCampusMemoriesError("CAMPUS_MEMORY_MAP_FAILED", error);
    throw new ApiError(500, "Could not map created Memory.", "CAMPUS_MEMORY_CREATE_FAILED");
  }
  return mapped;
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

  const mapped = mapCampusMemoryRow(data as CampusMemoryDbRow);
  if (!mapped) throw new ApiError(404, "Memory not found.", "CAMPUS_MEMORY_NOT_FOUND");
  return mapped;
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
