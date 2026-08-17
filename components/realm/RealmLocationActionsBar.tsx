"use client";

import { LocationPrimaryActions } from "@/components/realm/locationDetail/LocationPrimaryActions";
import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";

/** Compatibility wrapper — prefer LocationPrimaryActions in new code. */
export function RealmLocationActionsBar(props: {
  directionsEnabled: boolean;
  directionsDestination: RealmDirectionsDestination | null;
  directionsStatus: RealmDirectionsStatus;
  onRequestWalking?: () => void;
  onAddMemory?: () => void;
}) {
  return <LocationPrimaryActions {...props} />;
}
