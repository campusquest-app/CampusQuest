import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";

vi.mock("@/lib/server/supabase", () => ({
  requireAuthUser: vi.fn(),
}));

vi.mock("@/lib/server/groupedMapLocations", () => ({
  listGroupedMapLocations: vi.fn(),
}));

import { requireAuthUser } from "@/lib/server/supabase";
import { listGroupedMapLocations } from "@/lib/server/groupedMapLocations";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { GET } from "./route";

describe("GET /api/quests/map-pins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(requireAuthUser).mockRejectedValueOnce(new ApiError(401, "Invalid or expired token.", "UNAUTHORIZED"));

    const response = await GET(new Request("http://localhost/api/quests/map-pins"));
    expect(response.status).toBe(401);
    expect(listGroupedMapLocations).not.toHaveBeenCalled();
  });

  it("returns grouped locations for authenticated users", async () => {
    vi.mocked(requireAuthUser).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(listGroupedMapLocations).mockResolvedValueOnce([
      {
        groupKey: "library",
        locationKey: "library",
        realmLocationId: "library",
        locationName: "Library",
        locationAddress: null,
        x: 50,
        y: 50,
        lat: 41.48,
        lng: -71.53,
        attachToLandmark: true,
        qrCodes: [],
        quests: [],
        events: [],
      },
    ] as never);

    const response = await GET(new Request("http://localhost/api/quests/map-pins"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.groups).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/qrCode":"[^"]+/);
  });

  it("keeps progression disabled so raw QR codes stay off the map-pin path", () => {
    expect(FEATURE_FLAGS.progression).toBe(false);
  });
});
