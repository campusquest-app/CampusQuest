import { describe, expect, it } from "vitest";
import { resolveQuadPostLocationFields } from "@/lib/server/quadPostMutations";

describe("quadPostMutations", () => {
  it("clears location when id is invalid or empty", () => {
    expect(resolveQuadPostLocationFields({ locationId: null, locationName: "Library" })).toEqual({
      location_id: null,
      location_name: null,
    });
    expect(resolveQuadPostLocationFields({ locationId: "bad-id", locationName: "X" })).toEqual({
      location_id: null,
      location_name: null,
    });
  });

  it("resolves valid campus location fields", () => {
    expect(
      resolveQuadPostLocationFields({ locationId: "library", locationName: "Library" }),
    ).toEqual({
      location_id: "library",
      location_name: "Library",
    });
  });
});
