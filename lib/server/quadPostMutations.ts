import { isRealmLocationId, REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { shouldCreateRealmMoment } from "@/lib/realm/realmMomentEligibility";
import { getRealmLocationName, type RealmLocationId } from "@/lib/realm/locations";
import { createRealmMomentForPost } from "@/lib/server/realmMoments";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type QuadPostRow = {
  id: string;
  user_id: string;
  body: string;
  proof_url: string | null;
  visibility: "public" | "friends";
  location_id: string | null;
  location_name: string | null;
};

export async function getOwnedQuadPost(args: {
  userClient: SupabaseClientLike;
  postId: string;
  userId: string;
}): Promise<QuadPostRow> {
  const { data, error } = await args.userClient
    .from("quad_posts")
    .select("id, user_id, body, proof_url, visibility, location_id, location_name")
    .eq("id", args.postId)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load post.", "QUAD_POST_FETCH_FAILED");
  }
  if (!data) {
    throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");
  }
  if (data.user_id !== args.userId) {
    throw new ApiError(403, "You can only change your own posts.", "QUAD_POST_FORBIDDEN");
  }

  return data as QuadPostRow;
}

export async function syncRealmMomentForPostEdit(args: {
  userClient: SupabaseClientLike;
  postId: string;
  userId: string;
  visibility: "public" | "friends";
  locationId: string | null;
  locationName: string | null;
}): Promise<void> {
  const eligible = shouldCreateRealmMoment({
    visibility: args.visibility,
    locationId: args.locationId,
  });

  const { data: existing, error: fetchErr } = await args.userClient
    .from("realm_moments")
    .select("id")
    .eq("post_id", args.postId)
    .maybeSingle();

  if (fetchErr && !/relation.*does not exist|schema cache/i.test(fetchErr.message ?? "")) {
    console.error("[cq][realm-moments] sync fetch failed", { postId: args.postId, message: fetchErr.message });
    return;
  }

  if (!eligible) {
    if (existing?.id) {
      await args.userClient.from("realm_moments").update({ is_active: false }).eq("post_id", args.postId);
    }
    return;
  }

  const locationId = args.locationId!.trim();
  const realmLocationId = locationId as RealmLocationId;
  const locationName = (args.locationName?.trim() || getRealmLocationName(realmLocationId)).slice(0, 80);
  const geo = REALM_LOCATION_GEO[realmLocationId];

  if (existing?.id) {
    const { error: updErr } = await args.userClient
      .from("realm_moments")
      .update({
        location_id: locationId,
        location_name: locationName,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        is_active: true,
        visibility: "public",
      })
      .eq("post_id", args.postId);
    if (updErr) {
      console.error("[cq][realm-moments] sync update failed", { postId: args.postId, message: updErr.message });
    }
    return;
  }

  await createRealmMomentForPost({
    userClient: args.userClient,
    postId: args.postId,
    userId: args.userId,
    locationId,
    locationName,
  });
}

export function resolveQuadPostLocationFields(input: {
  locationId?: string | null;
  locationName?: string | null;
}): { location_id: string | null; location_name: string | null } {
  const rawId = input.locationId?.trim() ?? "";
  if (!rawId || !isRealmLocationId(rawId)) {
    return { location_id: null, location_name: null };
  }
  const locationName = (input.locationName?.trim() || getRealmLocationName(rawId as RealmLocationId)).slice(0, 80);
  return { location_id: rawId, location_name: locationName };
}
