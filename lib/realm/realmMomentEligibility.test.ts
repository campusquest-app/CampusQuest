import { describe, expect, it } from "vitest";
import { shouldCreateRealmMoment } from "@/lib/realm/realmMomentEligibility";

describe("shouldCreateRealmMoment", () => {
  it("creates moments for public posts with valid campus locations", () => {
    expect(
      shouldCreateRealmMoment({
        visibility: "public",
        locationId: "the-quad",
      }),
    ).toBe(true);
  });

  it("skips private posts even with a location", () => {
    expect(
      shouldCreateRealmMoment({
        visibility: "friends",
        locationId: "library",
      }),
    ).toBe(false);
  });

  it("skips public posts without a location", () => {
    expect(
      shouldCreateRealmMoment({
        visibility: "public",
        locationId: null,
      }),
    ).toBe(false);
  });

  it("skips unknown location ids", () => {
    expect(
      shouldCreateRealmMoment({
        visibility: "public",
        locationId: "north-campus",
      }),
    ).toBe(false);
  });
});
