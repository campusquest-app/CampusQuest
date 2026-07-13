export type RealmTravelMode = "WALKING" | "DRIVING" | "BICYCLING" | "TRANSIT";

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

export type RealmDirectionsStep = {
  instruction: string;
  distanceText: string;
  durationText: string;
};

export type RealmDirectionsSummary = {
  durationText: string;
  distanceText: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Maneuver segments from Directions API — displayed as "turns", never "steps". */
  turnCount?: number;
  /** @deprecated Use turnCount. Kept for cached route payloads. */
  stepsCount?: number;
  arrivalTimeLabel?: string;
  footstepsEstimate?: number;
  steps?: RealmDirectionsStep[];
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseDirectionsSummary(
  result: {
    routes?: Array<{
      legs?: Array<{
        duration?: { text: string; value: number };
        distance?: { text: string; value: number };
        steps?: Array<{
          html_instructions?: string;
          distance?: { text: string };
          duration?: { text: string };
        }>;
      }>;
    }>;
  },
): RealmDirectionsSummary | null {
  const leg = result.routes?.[0]?.legs?.[0];
  if (!leg?.duration || !leg.distance) return null;

  const turnCount = leg.steps?.length ?? 0;
  const durationSeconds = leg.duration.value;
  const distanceMeters = leg.distance.value;

  const steps: RealmDirectionsStep[] = (leg.steps ?? []).map((step) => ({
    instruction: stripHtml(step.html_instructions ?? ""),
    distanceText: step.distance?.text ?? "",
    durationText: step.duration?.text ?? "",
  }));

  const arrival = new Date(Date.now() + durationSeconds * 1000);
  const arrivalTimeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(arrival);

  return {
    durationText: leg.duration.text,
    distanceText: leg.distance.text,
    distanceMeters,
    durationSeconds,
    turnCount,
    stepsCount: turnCount,
    arrivalTimeLabel,
    footstepsEstimate:
      distanceMeters > 0 ? Math.round(distanceMeters / 0.78) : undefined,
    steps,
    approximate: false,
  };
}

