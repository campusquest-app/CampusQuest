import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: Array<{ slug: string; row: Record<string, unknown> }> = [];

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "campus_locations") {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        update: (row: Record<string, unknown>) => ({
          eq: (col: string, slug: string) => ({
            select: () => ({
              maybeSingle: async () => {
                updates.push({ slug, row });
                return { data: { slug }, error: null };
              },
            }),
          }),
        }),
      };
    },
  }),
}));

describe("persistCampusLocationGeoFromMarkerPositions", () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it("writes lat/lng/map percents and marks the campus place as manually adjusted", async () => {
    const { persistCampusLocationGeoFromMarkerPositions } = await import(
      "@/lib/server/realmMarkerPositions"
    );
    const result = await persistCampusLocationGeoFromMarkerPositions({
      "butterfield-dining": { x: 40, y: 55, lat: 41.4862, lng: -71.5284 },
    });
    expect(result.updated).toEqual(["butterfield-dining"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.row).toMatchObject({
      latitude: 41.4862,
      longitude: -71.5284,
      map_x: 40,
      map_y: 55,
      manually_adjusted: true,
    });
  });
});
