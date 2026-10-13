import type { SupabaseClient } from "@supabase/supabase-js";
import { findPartnerById } from "@/lib/partners/partnerDirectory";
import { REWARD_ERROR_CODES } from "@/lib/partners/rewardAccess";
import { ApiError } from "@/lib/server/http";

type UserClientLike = Pick<SupabaseClient, "from">;

export type PartnerFavoritesResponse = { partnerIds: string[] };

type PostgrestErrorLike = { code?: string; message?: string } | null;

/** True when the migration that creates the table has not been applied yet. */
export function isMissingTableError(error: PostgrestErrorLike, table: string): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return message.includes(table) && /does not exist|schema cache/i.test(message);
}

function favoritesUnavailable(): ApiError {
  return new ApiError(503, "Saved businesses aren\u2019t available yet.", "PARTNER_FAVORITES_UNAVAILABLE");
}

function requireKnownPartner(partnerId: string) {
  const partner = findPartnerById(partnerId);
  if (!partner) throw new ApiError(404, "This business isn\u2019t a CampusQuest partner.", REWARD_ERROR_CODES.partnerNotFound);
  return partner;
}

/** Runs under the caller's RLS session, so a user can only ever see and change their own rows. */
export async function listPartnerFavorites(userClient: UserClientLike, userId: string): Promise<string[]> {
  const { data, error } = await userClient
    .from("partner_favorites")
    .select("partner_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error, "partner_favorites")) throw favoritesUnavailable();
    throw new ApiError(500, "Could not load saved businesses.", "PARTNER_FAVORITES_FETCH_FAILED");
  }
  return (data ?? [])
    .map((row) => String((row as { partner_id: unknown }).partner_id))
    .filter((id) => findPartnerById(id) !== null);
}

export async function addPartnerFavorite(userClient: UserClientLike, userId: string, partnerId: string) {
  requireKnownPartner(partnerId);
  const { error } = await userClient
    .from("partner_favorites")
    .upsert({ user_id: userId, partner_id: partnerId }, { onConflict: "user_id,partner_id", ignoreDuplicates: true });
  if (error) {
    if (isMissingTableError(error, "partner_favorites")) throw favoritesUnavailable();
    throw new ApiError(500, "Could not save this business.", "PARTNER_FAVORITE_SAVE_FAILED");
  }
}

export async function removePartnerFavorite(userClient: UserClientLike, userId: string, partnerId: string) {
  const { error } = await userClient
    .from("partner_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("partner_id", partnerId);
  if (error) {
    if (isMissingTableError(error, "partner_favorites")) throw favoritesUnavailable();
    throw new ApiError(500, "Could not remove this business.", "PARTNER_FAVORITE_REMOVE_FAILED");
  }
}
