import { URI_MAP_CENTER } from "@/lib/realm/googleMapPose";

/** URI campus bounds for Places bias (Kingston campus core). */
export const URI_CAMPUS_BOUNDS = {
  south: 41.472,
  west: -71.545,
  north: 41.498,
  east: -71.515,
} as const;

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  formattedAddress: string | null;
};

function placesService(): google.maps.places.PlacesService | null {
  if (typeof google === "undefined" || !google.maps?.places) return null;
  const div = document.createElement("div");
  return new google.maps.places.PlacesService(div);
}

function autocompleteService(): google.maps.places.AutocompleteService | null {
  if (typeof google === "undefined" || !google.maps?.places) return null;
  return new google.maps.places.AutocompleteService();
}

/** Predictions biased toward URI campus but not restricted to it. */
export async function fetchPlacePredictions(
  input: string,
  signal?: AbortSignal,
): Promise<google.maps.places.AutocompletePrediction[]> {
  if (!input.trim() || signal?.aborted) return [];
  const service = autocompleteService();
  if (!service) return [];

  const bounds = new google.maps.LatLngBounds(
    { lat: URI_CAMPUS_BOUNDS.south, lng: URI_CAMPUS_BOUNDS.west },
    { lat: URI_CAMPUS_BOUNDS.north, lng: URI_CAMPUS_BOUNDS.east },
  );

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve([]);
      return;
    }
    service.getPlacePredictions(
      {
        input: input.trim(),
        bounds,
        location: new google.maps.LatLng(URI_MAP_CENTER.lat, URI_MAP_CENTER.lng),
        radius: 8_000,
        componentRestrictions: { country: "us" },
      },
      (predictions, status) => {
        if (signal?.aborted) {
          resolve([]);
          return;
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
          resolve([]);
          return;
        }
        resolve(predictions);
      },
    );
  });
}

export async function fetchPlaceDetails(
  placeId: string,
  signal?: AbortSignal,
): Promise<PlaceSearchResult | null> {
  if (!placeId || signal?.aborted) return null;
  const service = placesService();
  if (!service) return null;

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    service.getDetails(
      {
        placeId,
        fields: ["place_id", "name", "formatted_address", "geometry", "vicinity"],
      },
      (place, status) => {
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          resolve(null);
          return;
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        resolve({
          placeId: place.place_id ?? placeId,
          name: place.name ?? "Selected place",
          description: place.formatted_address ?? place.vicinity ?? "",
          lat,
          lng,
          formattedAddress: place.formatted_address ?? null,
        });
      },
    );
  });
}
