/**
 * Shared coordinate validation for URInvolved sync / map matching.
 * Coordinates must both be finite numbers before any geo math or bucketing.
 */

export type LatLng = {
  latitude: number;
  longitude: number;
};

export function hasValidCoordinates(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false;
  const lat = (value as { latitude?: unknown }).latitude;
  const lng = (value as { longitude?: unknown }).longitude;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
}
