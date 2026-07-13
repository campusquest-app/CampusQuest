import type {
  RealmDirectionsOrigin,
  RealmDirectionsSummary,
  RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";

export type RealmDirectionsLoadResult =
  | {
      ok: true;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      summary: RealmDirectionsSummary;
      origin: RealmDirectionsOrigin;
      directions: google.maps.DirectionsResult | null;
      approximate: boolean;
    }
  | {
      ok: false;
      requestId: number;
      travelMode: RealmTravelMode;
      destinationLabel: string;
      message: string;
      destinationLat?: number;
      destinationLng?: number;
    };
