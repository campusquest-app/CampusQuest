import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRouteCache } from "@/lib/realm/routeResultCache";
import { ROUTE_ERROR_MESSAGES } from "@/lib/realm/routeRequestConstants";

const resolveRouteDestinationCoordinates = vi.fn();
const resolveLiveUserLocation = vi.fn();
const fetchGoogleDirections = vi.fn();

vi.mock("@/lib/realm/geocodeRouteDestination", () => ({
  resolveRouteDestinationCoordinates: (...args: unknown[]) => resolveRouteDestinationCoordinates(...args),
}));

vi.mock("@/lib/realm/resolveDirectionsOrigin", () => ({
  resolveLiveUserLocation: (...args: unknown[]) => resolveLiveUserLocation(...args),
  toDirectionsOrigin: (point: { lat: number; lng: number }) => ({
    lat: point.lat,
    lng: point.lng,
    label: "You",
    usedFallback: false,
    hint: null,
  }),
}));

vi.mock("@/lib/realm/fetchGoogleDirections", () => ({
  fetchGoogleDirections: (...args: unknown[]) => fetchGoogleDirections(...args),
}));

import { getRouteToLocation } from "@/lib/realm/getRouteToLocation";

const mockService = {} as google.maps.DirectionsService;

const origin = { lat: 41.4862, lng: -71.5309 };
const destination = { lat: 41.4871, lng: -71.5305, label: "Library" };

function mockDirectionsOk() {
  fetchGoogleDirections.mockResolvedValue({
    status: "OK" as google.maps.DirectionsStatus,
    result: {
      routes: [
        {
          overview_path: [{ lat: () => 41.4865, lng: () => -71.5307 }],
          legs: [
            {
              duration: { text: "5 min", value: 300 },
              distance: { text: "0.2 mi", value: 320 },
              steps: [{}],
            },
          ],
        },
      ],
    },
  });
}

describe("getRouteToLocation", () => {
  beforeEach(() => {
    clearRouteCache();
    vi.clearAllMocks();
    global.google = {
      maps: {
        DirectionsStatus: { OK: "OK" },
      },
    } as unknown as typeof google;
    resolveRouteDestinationCoordinates.mockResolvedValue({
      lat: destination.lat,
      lng: destination.lng,
      geocoded: false,
    });
    resolveLiveUserLocation.mockResolvedValue(origin);
  });

  it("uses saved coordinates without geocoding", async () => {
    mockDirectionsOk();

    const result = await getRouteToLocation({
      requestId: 1,
      destinationId: "library",
      destinationName: destination.label,
      latitude: destination.lat,
      longitude: destination.lng,
      travelMode: "WALKING",
      directionsService: mockService,
    });

    expect(result.ok).toBe(true);
    expect(resolveRouteDestinationCoordinates).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: "library",
        latitude: destination.lat,
        longitude: destination.lng,
      }),
    );
  });

  it("returns location unavailable when origin cannot be resolved", async () => {
    resolveLiveUserLocation.mockResolvedValue(null);

    const result = await getRouteToLocation({
      requestId: 2,
      destinationName: destination.label,
      latitude: destination.lat,
      longitude: destination.lng,
      travelMode: "WALKING",
      directionsService: mockService,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("locationUnavailable");
      expect(result.message).toBe(ROUTE_ERROR_MESSAGES.locationUnavailable);
      expect(result.destination).toEqual({
        lat: destination.lat,
        lng: destination.lng,
        label: destination.label,
      });
    }
  });

  it("returns destination not found when geocoding fails", async () => {
    resolveRouteDestinationCoordinates.mockResolvedValue(null);

    const result = await getRouteToLocation({
      requestId: 3,
      destinationName: "Unknown Hall",
      travelMode: "WALKING",
      directionsService: mockService,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("destinationNotFound");
      expect(result.destination).toBeNull();
    }
  });

  it("serves repeated requests from the route cache", async () => {
    mockDirectionsOk();

    const args = {
      requestId: 4,
      destinationName: destination.label,
      latitude: destination.lat,
      longitude: destination.lng,
      travelMode: "WALKING" as const,
      directionsService: mockService,
      userLocation: origin,
    };

    const first = await getRouteToLocation(args);
    const second = await getRouteToLocation({ ...args, requestId: 5 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.fromCache).toBe(true);
    }
    expect(fetchGoogleDirections).toHaveBeenCalledTimes(1);
  });

  it("aborts when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await getRouteToLocation({
      requestId: 6,
      destinationName: destination.label,
      latitude: destination.lat,
      longitude: destination.lng,
      travelMode: "WALKING",
      directionsService: mockService,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("aborted");
    expect(fetchGoogleDirections).not.toHaveBeenCalled();
  });

  it("returns timeout error for driving when directions time out", async () => {
    fetchGoogleDirections.mockRejectedValue(new Error("directions_timeout"));

    const result = await getRouteToLocation({
      requestId: 7,
      destinationName: destination.label,
      latitude: destination.lat,
      longitude: destination.lng,
      travelMode: "DRIVING",
      directionsService: mockService,
      userLocation: origin,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
      expect(result.message).toBe(ROUTE_ERROR_MESSAGES.timeout);
    }
  });
});
