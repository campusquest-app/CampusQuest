import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import type { RealmLocationId } from "@/lib/realm/locations";
import type { PlaceSearchResult } from "@/lib/realm/placesSearch";

export type SearchPlaceMatch =
  | { kind: "landmark"; id: RealmLocationId }
  | { kind: "group"; group: GroupedMapLocation }
  | { kind: "place"; group: GroupedMapLocation };

function normalizePlaceLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+(hall|building|center|centre|lounge|room|floor)\b.*$/i, "")
    .trim();
}

function labelsMatch(a: string, b: string): boolean {
  const na = normalizePlaceLabel(a);
  const nb = normalizePlaceLabel(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Match a Google Places result to an existing CQ landmark or grouped pin. */
export function resolveSearchPlaceMatch(args: {
  place: PlaceSearchResult;
  landmarks: Array<{ id: RealmLocationId; name: string; shortLabel?: string }>;
  supplementaryPins: GroupedMapLocation[];
  catalogNames?: Array<{ name: string; aliases?: string[]; slug?: string; googlePlaceId?: string | null }>;
}): SearchPlaceMatch {
  const { place, landmarks, supplementaryPins, catalogNames = [] } = args;

  if (place.placeId) {
    for (const row of catalogNames) {
      if (row.googlePlaceId && row.googlePlaceId === place.placeId) {
        const landmark = landmarks.find((l) => labelsMatch(l.name, row.name));
        if (landmark) return { kind: "landmark", id: landmark.id };
        const group = supplementaryPins.find((g) => labelsMatch(g.locationName, row.name));
        if (group) return { kind: "group", group };
      }
    }
  }

  for (const landmark of landmarks) {
    if (
      labelsMatch(place.name, landmark.name) ||
      (landmark.shortLabel && labelsMatch(place.name, landmark.shortLabel))
    ) {
      return { kind: "landmark", id: landmark.id };
    }
  }

  for (const row of catalogNames) {
    const names = [row.name, ...(row.aliases ?? [])];
    if (names.some((name) => labelsMatch(place.name, name))) {
      const landmark = landmarks.find((l) => labelsMatch(l.name, row.name));
      if (landmark) return { kind: "landmark", id: landmark.id };
    }
  }

  for (const group of supplementaryPins) {
    if (labelsMatch(place.name, group.locationName)) {
      return { kind: "group", group };
    }
  }

  const synthetic: GroupedMapLocation = {
    groupKey: `search:${place.placeId}`,
    locationKey: null,
    realmLocationId: null,
    locationName: place.name,
    locationAddress: place.formattedAddress ?? place.description,
    x: 50,
    y: 50,
    lat: place.lat,
    lng: place.lng,
    attachToLandmark: false,
    qrCodes: [],
    quests: [],
    events: [],
  };

  return { kind: "place", group: synthetic };
}
