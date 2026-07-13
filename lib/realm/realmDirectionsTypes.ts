export type RealmTravelMode = "WALKING" | "DRIVING";

export type RealmDirectionsDestination = {
  label: string;
  id?: string;
  lat?: number;
  lng?: number;
};

export type RealmDirectionsRequest = {
  id: number;
  destination: RealmDirectionsDestination;
  travelMode: RealmTravelMode;
};

export type RealmDirectionsSummary = {
  durationText: string;
  distanceText: string;
  distanceMeters: number;
  durationSeconds: number;
  stepsCount?: number;
  approximate?: boolean;
};

export type RealmDirectionsOrigin = {
  lat: number;
  lng: number;
  label: string;
  usedFallback: boolean;
  hint: string | null;
};

export type RealmDirectionsStatus =
  | { status: "idle" }
  | {
      status: "loading";
      travelMode: RealmTravelMode;
      destinationLabel: string;
      destinationId?: string;
      destinationLat?: number;
      destinationLng?: number;
    }
  | {
      status: "ready";
      travelMode: RealmTravelMode;
      destinationLabel: string;
      summary: RealmDirectionsSummary;
      origin: RealmDirectionsOrigin;
    }
  | {
      status: "error";
      travelMode: RealmTravelMode;
      destinationLabel: string;
      message: string;
      destinationLat?: number;
      destinationLng?: number;
    };

/** Suggest driving when walking route exceeds ~1.2 mi / 2 km. */
export const REALM_DRIVING_SUGGEST_METERS = 2000;

export function parseDirectionsSummary(
  result: {
    routes?: Array<{
      legs?: Array<{
        duration?: { text: string; value: number };
        distance?: { text: string; value: number };
        steps?: unknown[];
      }>;
    }>;
  },
): RealmDirectionsSummary | null {
  const leg = result.routes?.[0]?.legs?.[0];
  if (!leg?.duration || !leg.distance) return null;
  return {
    durationText: leg.duration.text,
    distanceText: leg.distance.text,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    stepsCount: leg.steps?.length,
    approximate: false,
  };
}

