import {
  buildingNameForDisplay,
  buildingNameTokens,
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";
import {
  isBroadCampusOnlyResult,
  isRejectedRoadResult,
  isWithinUriCampusBounds,
  URI_CAMPUS_BOUNDS,
} from "@/lib/server/urinvolved/uriCampusBounds";

export type GoogleGeocodeResult = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  types: string[];
  confidence: number;
  query: string;
};

type GeocodeApiResponse = {
  status: string;
  results?: Array<{
    place_id: string;
    formatted_address: string;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
  }>;
  error_message?: string;
};

export const MIN_PUBLIC_MAP_CONFIDENCE = 0.75;

function googleMapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export function buildUriBuildingGeocodeQuery(buildingName: string): string {
  const display = buildingNameForDisplay(buildingName);
  return `${display}, University of Rhode Island, Kingston, RI`;
}

function primaryNameFromResult(result: NonNullable<GeocodeApiResponse["results"]>[number]): string {
  const premise = result.address_components?.find((c) => c.types?.includes("premise"))?.long_name;
  if (premise?.trim()) return premise.trim();
  const route = result.address_components?.find((c) => c.types?.includes("route"))?.long_name;
  if (route?.trim()) return route.trim();
  return result.formatted_address.split(",")[0]?.trim() ?? result.formatted_address;
}

export function scoreGeocodeResult(args: {
  requestedBuilding: string;
  formattedAddress: string;
  name: string;
  types: string[];
}): number {
  const requested = normalizeCampusLocationName(args.requestedBuilding);
  const haystack = normalizeCampusLocationName(`${args.name} ${args.formattedAddress}`);
  const tokens = buildingNameTokens(requested);
  if (!tokens.length) return 0;

  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matched += 1;
  }
  const tokenScore = matched / tokens.length;
  if (tokenScore < 0.5) return 0;

  let score = 0.55 + tokenScore * 0.35;
  if (args.types.includes("premise") || args.types.includes("establishment")) score += 0.08;
  if (args.types.includes("point_of_interest")) score += 0.04;
  if (isRejectedRoadResult(args.formattedAddress) && !haystack.includes(requested)) score -= 0.5;
  if (isBroadCampusOnlyResult(args.name, requested)) score -= 0.6;
  return Math.max(0, Math.min(1, score));
}

export function validateGeocodeResult(args: {
  requestedBuilding: string;
  formattedAddress: string;
  name: string;
  latitude: number;
  longitude: number;
  confidence: number;
}): { accepted: boolean; reason: string } {
  if (!isWithinUriCampusBounds(args.latitude, args.longitude)) {
    return { accepted: false, reason: "outside_campus_bounds" };
  }
  if (isRejectedRoadResult(`${args.name} ${args.formattedAddress}`)) {
    const requested = normalizeCampusLocationName(args.requestedBuilding);
    const haystack = normalizeCampusLocationName(`${args.name} ${args.formattedAddress}`);
    if (!buildingNameTokens(requested).some((token) => haystack.includes(token))) {
      return { accepted: false, reason: "road_only_result" };
    }
  }
  if (isBroadCampusOnlyResult(args.name, args.requestedBuilding)) {
    return { accepted: false, reason: "broad_campus_result" };
  }
  if (args.confidence < MIN_PUBLIC_MAP_CONFIDENCE) {
    return { accepted: false, reason: "low_confidence" };
  }
  const requested = normalizeCampusLocationName(args.requestedBuilding);
  const haystack = normalizeCampusLocationName(`${args.name} ${args.formattedAddress}`);
  if (!buildingNameTokens(requested).some((token) => haystack.includes(token))) {
    return { accepted: false, reason: "building_name_mismatch" };
  }
  return { accepted: true, reason: "google_geocode" };
}

export async function geocodeUriBuilding(args: {
  buildingName: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleGeocodeResult | null> {
  const normalized = normalizeCampusLocationName(args.buildingName);
  if (normalized.length < 4) return null;

  const apiKey = googleMapsApiKey();
  if (!apiKey) return null;

  const query = buildUriBuildingGeocodeQuery(normalized);
  const fetchFn = args.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
    bounds: `${URI_CAMPUS_BOUNDS.minLat},${URI_CAMPUS_BOUNDS.minLng}|${URI_CAMPUS_BOUNDS.maxLat},${URI_CAMPUS_BOUNDS.maxLng}`,
    region: "us",
  });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const response = await fetchFn(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as GeocodeApiResponse;
  if (payload.status !== "OK" || !payload.results?.length) return null;

  let best: GoogleGeocodeResult | null = null;
  for (const result of payload.results) {
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (lat == null || lng == null) continue;

    const name = primaryNameFromResult(result);
    const formattedAddress = result.formatted_address;
    const types = result.types ?? [];
    const confidence = scoreGeocodeResult({
      requestedBuilding: normalized,
      formattedAddress,
      name,
      types,
    });
    const validation = validateGeocodeResult({
      requestedBuilding: normalized,
      formattedAddress,
      name,
      latitude: lat,
      longitude: lng,
      confidence,
    });
    if (!validation.accepted) continue;

    const candidate: GoogleGeocodeResult = {
      placeId: result.place_id,
      name,
      formattedAddress,
      latitude: lat,
      longitude: lng,
      types,
      confidence,
      query,
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }

  return best;
}
