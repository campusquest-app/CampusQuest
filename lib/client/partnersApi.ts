"use client";

import { ApiRequestError, deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { PartnerSuggestionRequest } from "@/lib/partners/partnerSuggestion";
import { rewardIssueFromError, type RewardAccessIssue, type RewardPassResponse } from "@/lib/partners/rewardAccess";

export type PartnerFavoritesPayload = { partnerIds: string[] };

export function requestRewardPass(partnerId: string, refresh: boolean): Promise<RewardPassResponse> {
  return postAuthed<RewardPassResponse, { refresh: boolean }>(
    `/api/partners/${encodeURIComponent(partnerId)}/reward-pass`,
    { refresh },
  );
}

/** Fire-and-forget view analytics. Failures are ignored so they never affect the student. */
export function reportPartnerView(partnerId: string, type: "profile_view" | "reward_view"): void {
  void postAuthed(`/api/partners/${encodeURIComponent(partnerId)}/events`, { type }).catch(() => {});
}

export function fetchPartnerFavorites(): Promise<PartnerFavoritesPayload> {
  return fetchAuthed<PartnerFavoritesPayload>("/api/partners/favorites");
}

export function savePartnerFavorite(partnerId: string): Promise<PartnerFavoritesPayload> {
  return postAuthed<PartnerFavoritesPayload, { partnerId: string }>("/api/partners/favorites", { partnerId });
}

export function removePartnerFavorite(partnerId: string): Promise<PartnerFavoritesPayload> {
  return deleteAuthed<PartnerFavoritesPayload>(`/api/partners/favorites?partnerId=${encodeURIComponent(partnerId)}`);
}

export function sendPartnerSuggestion(body: PartnerSuggestionRequest): Promise<{ submitted: boolean }> {
  return postAuthed<{ submitted: boolean }, Record<string, unknown>>("/api/partners/suggestions", body);
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Network failures (no HTTP status) count as offline only when the browser agrees it is offline. */
export function rewardIssueFromUnknown(error: unknown): RewardAccessIssue {
  if (error instanceof ApiRequestError) return rewardIssueFromError({ status: error.status, code: error.code });
  return isOffline() ? "offline" : "error";
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message ? error.message : fallback;
}
