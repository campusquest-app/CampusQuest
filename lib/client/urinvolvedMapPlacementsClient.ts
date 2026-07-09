"use client";

import { fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type UrinvolvedPlacementCatalogEntry = {
  slug: string;
  name: string;
};

export type UrinvolvedPlacementOverride = {
  id: string;
  externalEventId: string;
  realmLocationId: string | null;
  customLat: number | null;
  customLng: number | null;
  customLabel: string | null;
  matchStatus: "auto_matched" | "manually_adjusted" | "unmatched" | "hidden" | "ignored";
  matchConfidence: number | null;
  matchReason: string | null;
  rawLocationText: string | null;
  normalizedLocationText: string | null;
};

export type UrinvolvedPlacementEvent = {
  externalEventId: string;
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  organizationName: string | null;
  rawLocationText: string;
  normalizedLocationText: string;
  source: "urinvolved";
  override: UrinvolvedPlacementOverride | null;
  autoMatch: {
    rawLocation: string;
    normalizedLocation: string;
    confidence: number;
    matchReason: string;
    needsReview: boolean;
    matchedText: string;
  } | null;
  currentMatch: {
    kind: "realm" | "coords";
    realmLocationId?: string;
    locationName: string;
    latitude?: number;
    longitude?: number;
    matchedText: string;
  } | null;
  renderOnMap: boolean;
  suggestedMatches: Array<{
    realmLocationId: string;
    name: string;
    confidence: number;
    reason: string;
  }>;
};

export type UrinvolvedPlacementsResponse = {
  catalog: UrinvolvedPlacementCatalogEntry[];
  events: UrinvolvedPlacementEvent[];
  unmatched: UrinvolvedPlacementEvent[];
  needsReview: UrinvolvedPlacementEvent[];
};

export async function fetchUrinvolvedMapPlacements(signal?: AbortSignal): Promise<UrinvolvedPlacementsResponse> {
  return fetchAuthed<UrinvolvedPlacementsResponse>("/api/internal/admin/urinvolved-map-placements", { signal });
}

export async function saveUrinvolvedPlacement(args: {
  externalEventId: string;
  realmLocationId?: string | null;
  customLat?: number | null;
  customLng?: number | null;
  customLabel?: string | null;
  matchStatus?: "manually_adjusted" | "hidden" | "ignored";
  normalizedLocationText?: string | null;
}): Promise<{ override: UrinvolvedPlacementOverride }> {
  return patchAuthed(`/api/internal/admin/urinvolved-map-placements/${args.externalEventId}`, args);
}

export async function resetUrinvolvedPlacement(
  externalEventId: string,
): Promise<{ override: UrinvolvedPlacementOverride | null }> {
  return postAuthed(`/api/internal/admin/urinvolved-map-placements/${externalEventId}/reset`, {});
}
