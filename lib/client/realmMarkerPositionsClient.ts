"use client";

import { fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import type { MarkerPositionMap } from "@/lib/realm/markerPositionsStore";

export type RealmMarkerPositionsResponse = {
  positions: MarkerPositionMap;
  updatedAt: string | null;
  updatedBy: string | null;
};

const PATH = "/api/realm/marker-positions";

export async function fetchRealmMarkerPositions(): Promise<RealmMarkerPositionsResponse> {
  return fetchAuthed<RealmMarkerPositionsResponse>(PATH);
}

export async function saveRealmMarkerPositionsToServer(
  positions: MarkerPositionMap,
): Promise<RealmMarkerPositionsResponse> {
  return patchAuthed<RealmMarkerPositionsResponse, { positions: MarkerPositionMap }>(PATH, { positions });
}
