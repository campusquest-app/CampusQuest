import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { isMissingTableError } from "@/lib/server/partnerFavorites";
import type { PartnerSuggestionInput } from "@/lib/partners/partnerSuggestion";

type ClientLike = Pick<SupabaseClient, "from">;

/** Mirrors the database trigger so the student gets a clear message before the insert is rejected. */
export const PARTNER_SUGGESTION_DAILY_LIMIT = 5;

function suggestionsUnavailable(): ApiError {
  return new ApiError(503, "Suggestions aren\u2019t available yet. Please try again later.", "PARTNER_SUGGESTIONS_UNAVAILABLE");
}

function dailyLimitReached(): ApiError {
  return new ApiError(429, "You\u2019ve sent a lot of suggestions today. Try again tomorrow.", "PARTNER_SUGGESTION_LIMIT");
}

function duplicateSuggestion(): ApiError {
  return new ApiError(409, "You already suggested this business today. Thanks!", "PARTNER_SUGGESTION_DUPLICATE");
}

/**
 * Stores a suggestion for admin review. Students have no direct insert access, so this runs with the
 * service role; `userId` must come from the authenticated session. The database trigger is the
 * authoritative limit and duplicate check; the pre-check here only gives a friendlier early answer.
 */
export async function submitPartnerSuggestion(args: {
  admin: ClientLike;
  userId: string;
  input: PartnerSuggestionInput;
  now?: Date;
}): Promise<{ id: string; createdAt: string }> {
  const { admin, userId, input } = args;
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const recent = await admin
    .from("partner_suggestions")
    .select("id, business_name")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (recent.error) {
    if (isMissingTableError(recent.error, "partner_suggestions")) throw suggestionsUnavailable();
    throw new ApiError(500, "Could not send your suggestion.", "PARTNER_SUGGESTION_FAILED");
  }
  const rows = (recent.data ?? []) as Array<{ business_name?: string | null }>;
  if (rows.length >= PARTNER_SUGGESTION_DAILY_LIMIT) throw dailyLimitReached();
  const normalized = input.businessName.trim().toLowerCase();
  if (rows.some((row) => (row.business_name ?? "").trim().toLowerCase() === normalized)) {
    throw duplicateSuggestion();
  }

  const { data, error } = await admin
    .from("partner_suggestions")
    .insert({
      user_id: userId,
      business_name: input.businessName,
      location: input.location,
      reason: input.reason,
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    if (isMissingTableError(error, "partner_suggestions")) throw suggestionsUnavailable();
    if (error?.message?.includes("partner_suggestions_daily_limit")) throw dailyLimitReached();
    if (error?.message?.includes("partner_suggestions_duplicate")) throw duplicateSuggestion();
    throw new ApiError(500, "Could not send your suggestion.", "PARTNER_SUGGESTION_FAILED");
  }
  const row = data as { id: string; created_at: string };
  return { id: row.id, createdAt: row.created_at };
}

export async function listPartnerSuggestionsForAdmin(admin: ClientLike, limit = 200) {
  const capped = Math.max(1, Math.min(500, limit));
  const { data, error } = await admin
    .from("partner_suggestions")
    .select("id, user_id, business_name, location, reason, status, created_at, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) {
    if (isMissingTableError(error, "partner_suggestions")) throw suggestionsUnavailable();
    throw new ApiError(500, "Could not load partner suggestions.", "PARTNER_SUGGESTIONS_FETCH_FAILED");
  }
  return data ?? [];
}
