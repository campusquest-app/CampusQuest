import { REALM_LOCATION_GEO, isRealmLocationId } from "@/lib/realm/locationGeo";
import { formatExpiresIn, formatPostedAgo } from "@/lib/realm/momentTime";
import { getRealmLocationName, type RealmLocationId } from "@/lib/realm/locations";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;

export type RealmMomentApiRow = {
  id: string;
  postId: string;
  userId: string;
  locationId: string;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  expiresAt: string;
  createdAt: string;
  body: string;
  mediaUrl: string | null;
  username: string;
  displayName: string;
  authorAvatar: string;
  postedAgoLabel: string;
  expiresInLabel: string;
};

type RealmMomentDbRow = {
  id: string;
  post_id: string;
  user_id: string;
  location_id: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  expires_at: string;
  created_at: string;
  quad_posts: {
    body: string;
    proof_url: string | null;
    visibility: string;
    created_at: string;
  } | {
    body: string;
    proof_url: string | null;
    visibility: string;
    created_at: string;
  }[] | null;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_custom_json: string | null;
  } | {
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_custom_json: string | null;
  }[] | null;
};

function avatarFromProfile(p: RealmMomentDbRow["profiles"]): string {
  const prof = Array.isArray(p) ? p[0] : p;
  const custom = (prof?.avatar_custom_json ?? "").trim();
  if (custom) return custom;
  const url = (prof?.avatar_url ?? "").trim();
  if (url) return url;
  return "🎓";
}

function mapMomentRow(row: RealmMomentDbRow, nowMs = Date.now()): RealmMomentApiRow | null {
  const post = Array.isArray(row.quad_posts) ? row.quad_posts[0] : row.quad_posts;
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  if (!post || post.visibility !== "public") return null;

  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    locationId: row.location_id,
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    body: post.body,
    mediaUrl: post.proof_url,
    username: (prof?.username ?? "student").trim().toLowerCase(),
    displayName: (prof?.display_name ?? "Student").trim() || "Student",
    authorAvatar: avatarFromProfile(row.profiles),
    postedAgoLabel: formatPostedAgo(post.created_at ?? row.created_at, nowMs),
    expiresInLabel: formatExpiresIn(row.expires_at, nowMs),
  };
}

export async function createRealmMomentForPost(args: {
  userClient: SupabaseClientLike;
  postId: string;
  userId: string;
  locationId: string;
  locationName?: string;
}): Promise<{ id: string; locationId: string; locationName: string; expiresAt: string } | null> {
  const locationId = args.locationId.trim();
  if (!isRealmLocationId(locationId)) return null;

  const realmLocationId = locationId as RealmLocationId;
  const locationName = (args.locationName?.trim() || getRealmLocationName(realmLocationId)).slice(0, 80);
  const geo = REALM_LOCATION_GEO[realmLocationId];
  const expiresAt = new Date(Date.now() + MOMENT_TTL_MS).toISOString();

  const { data, error } = await args.userClient
    .from("realm_moments")
    .insert({
      post_id: args.postId,
      user_id: args.userId,
      location_id: locationId,
      location_name: locationName,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      expires_at: expiresAt,
      visibility: "public",
      is_active: true,
    })
    .select("id, location_id, location_name, expires_at")
    .single();

  if (error) {
    console.error("[cq][realm-moments] create failed", {
      postId: args.postId,
      locationId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return {
    id: String(data.id),
    locationId: String(data.location_id),
    locationName: String(data.location_name),
    expiresAt: String(data.expires_at),
  };
}

export async function fetchActiveRealmMoments(args?: {
  locationId?: string;
  limit?: number;
}): Promise<RealmMomentApiRow[]> {
  const admin = createAdminClient();
  const limit = Math.min(200, Math.max(1, args?.limit ?? 120));
  const nowIso = new Date().toISOString();

  let query = admin
    .from("realm_moments")
    .select(
      `
        id,
        post_id,
        user_id,
        location_id,
        location_name,
        latitude,
        longitude,
        expires_at,
        created_at,
        quad_posts!inner (
          body,
          proof_url,
          visibility,
          created_at
        ),
        profiles!realm_moments_user_id_fkey (
          username,
          display_name,
          avatar_url,
          avatar_custom_json
        )
      `,
    )
    .eq("is_active", true)
    .eq("visibility", "public")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args?.locationId) {
    query = query.eq("location_id", args.locationId);
  }

  const { data, error } = await query;
  if (error) {
    if (/relation.*does not exist|schema cache/i.test(error.message ?? "")) {
      return [];
    }
    throw new ApiError(400, error.message ?? "Could not load Realm Moments.", "REALM_MOMENTS_FETCH_FAILED");
  }

  const nowMs = Date.now();
  const mapped: RealmMomentApiRow[] = [];
  for (const row of (data ?? []) as unknown as RealmMomentDbRow[]) {
    const item = mapMomentRow(row, nowMs);
    if (item) mapped.push(item);
  }
  return mapped;
}

export function groupRealmMomentsByLocation(
  moments: RealmMomentApiRow[],
): Record<string, RealmMomentApiRow[]> {
  const out: Record<string, RealmMomentApiRow[]> = {};
  for (const moment of moments) {
    const list = out[moment.locationId] ?? [];
    list.push(moment);
    out[moment.locationId] = list;
  }
  return out;
}
