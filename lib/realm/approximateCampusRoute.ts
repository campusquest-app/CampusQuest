import type { RealmDirectionsOrigin, RealmDirectionsSummary } from "@/lib/realm/realmDirectionsTypes";

const WALKING_SPEED_MPS = 1.4;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

/** Straight-line campus approximation when Directions API is unavailable. */
export function buildApproximateCampusRoute(args: {
  origin: RealmDirectionsOrigin;
  destination: { lat: number; lng: number; label: string };
}): {
  path: Array<{ lat: number; lng: number }>;
  summary: RealmDirectionsSummary;
} {
  const origin = { lat: args.origin.lat, lng: args.origin.lng };
  const destination = { lat: args.destination.lat, lng: args.destination.lng };
  const distanceMeters = haversineMeters(origin, destination);
  const durationSeconds = Math.round(distanceMeters / WALKING_SPEED_MPS);

  const path = [origin, destination];

  return {
    path,
    summary: {
      durationText: formatDuration(durationSeconds),
      distanceText: formatDistance(distanceMeters),
      distanceMeters,
      durationSeconds,
      stepsCount: 1,
      approximate: true,
    },
  };
}
