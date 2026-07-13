import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";

export function isDirectionsLoadingForDestination(
  destination: RealmDirectionsDestination | null,
  status: RealmDirectionsStatus,
): boolean {
  if (!destination || status.status !== "loading") return false;
  if (destination.id && status.destinationId) {
    return destination.id === status.destinationId;
  }
  if (
    destination.lat != null &&
    destination.lng != null &&
    status.destinationLat != null &&
    status.destinationLng != null
  ) {
    return destination.lat === status.destinationLat && destination.lng === status.destinationLng;
  }
  return destination.label === status.destinationLabel;
}

export function hasResolvableDestinationCoords(destination: RealmDirectionsDestination | null): boolean {
  if (!destination) return false;
  if (destination.lat != null && destination.lng != null) return true;
  return Boolean(destination.label.trim());
}
