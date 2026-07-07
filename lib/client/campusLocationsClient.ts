"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  setCampusLocationCatalogCache,
  type CampusLocationRecord,
} from "@/lib/locations/campusLocationCatalog";

export type CampusLocationApiRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  mapX: number | null;
  mapY: number | null;
  markerEmoji: string;
  shortLabel: string;
  fantasyName: string;
  flavorText: string;
  major: boolean;
  legacyCampusKey: string | null;
  sortOrder: number;
  isBuiltin: boolean;
};

function mapApiRow(row: CampusLocationApiRow): CampusLocationRecord {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    mapX: row.mapX,
    mapY: row.mapY,
    markerEmoji: row.markerEmoji,
    shortLabel: row.shortLabel,
    fantasyName: row.fantasyName,
    flavorText: row.flavorText,
    major: row.major,
    legacyCampusKey: (row.legacyCampusKey as CampusLocationRecord["legacyCampusKey"]) ?? null,
    sortOrder: row.sortOrder,
    isBuiltin: row.isBuiltin,
    isActive: true,
  };
}

export async function fetchCampusLocationsClient(options?: { signal?: AbortSignal }): Promise<CampusLocationRecord[]> {
  const data = await fetchAuthed<{ locations: CampusLocationApiRow[] }>("/api/campus-locations", {
    signal: options?.signal,
  });
  const rows = (data.locations ?? []).map(mapApiRow);
  if (rows.length > 0) setCampusLocationCatalogCache(rows);
  return rows;
}

export async function createCampusLocationFromMarker(args: {
  name: string;
  mapX: number;
  mapY: number;
  latitude?: number | null;
  longitude?: number | null;
  slug?: string;
}): Promise<CampusLocationRecord> {
  const data = await postAuthed<
    { location: CampusLocationRecord },
    {
      name: string;
      mapX: number;
      mapY: number;
      latitude?: number | null;
      longitude?: number | null;
      slug?: string;
      fromMarker: { mapX: number; mapY: number; latitude?: number | null; longitude?: number | null };
    }
  >("/api/internal/admin/campus-locations", {
    name: args.name,
    mapX: args.mapX,
    mapY: args.mapY,
    latitude: args.latitude,
    longitude: args.longitude,
    slug: args.slug,
    fromMarker: {
      mapX: args.mapX,
      mapY: args.mapY,
      latitude: args.latitude,
      longitude: args.longitude,
    },
  });
  await fetchCampusLocationsClient();
  return data.location;
}

export function useCampusLocations(options?: { active?: boolean }) {
  const active = options?.active ?? true;
  const [locations, setLocations] = useState<CampusLocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCampusLocationsClient({ signal });
      if (signal?.aborted) return;
      setLocations(rows);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not load campus locations.");
      setLocations([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, active]);

  return { locations, loading, error, reload };
}
