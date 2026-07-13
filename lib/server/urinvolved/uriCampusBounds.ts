/** Approximate URI Kingston campus bounding box for geocode validation. */
export const URI_CAMPUS_BOUNDS = {
  minLat: 41.478,
  maxLat: 41.498,
  minLng: -71.542,
  maxLng: -71.515,
  center: { latitude: 41.4875, longitude: -71.5305 },
  radiusMeters: 2200,
} as const;

export function isWithinUriCampusBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= URI_CAMPUS_BOUNDS.minLat &&
    latitude <= URI_CAMPUS_BOUNDS.maxLat &&
    longitude >= URI_CAMPUS_BOUNDS.minLng &&
    longitude <= URI_CAMPUS_BOUNDS.maxLng
  );
}

/** Roads / broad campus labels that must not be used as building pins. */
const REJECTED_ROAD_PATTERNS = [
  /\bflagg\s+(rd|road)\b/i,
  /\bkingston\s+(rd|road)\b/i,
  /\bupper\s+college\s+rd\b/i,
  /\blower\s+college\s+rd\b/i,
  /\bfortin\s+rd\b/i,
  /\broad\b/i,
  /\bavenue\b/i,
  /\bstreet\b/i,
  /\bdrive\b/i,
];

const BROAD_CAMPUS_ONLY_PATTERNS = [
  /^university of rhode island$/i,
  /^uri$/i,
  /^kingston$/i,
  /^university of rhode island kingston$/i,
];

export function isRejectedRoadResult(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  return REJECTED_ROAD_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isBroadCampusOnlyResult(text: string, requestedBuilding: string): boolean {
  const normalized = text.trim().toLowerCase();
  const building = requestedBuilding.trim().toLowerCase();
  if (!building || building.length < 4) return false;
  if (!BROAD_CAMPUS_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  const buildingTokens = building.split(" ").filter((t) => t.length > 2);
  return !buildingTokens.some((token) => normalized.includes(token));
}
