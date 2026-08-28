import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getRealmLocationHeroImage } from "@/lib/realm/locationHeroImages";
import {
  PLACE_IMAGES,
  placeCardImage,
  placeCardImageAlt,
  placeCardImageObjectPosition,
} from "@/lib/realm/placeImages";

const SUPPLIED_IDS = [
  "the-quad",
  "business-building",
  "memorial-union",
  "butterfield-dining",
  "rec-center",
  "mainfare-dining",
  "engineering-hall",
] as const;

describe("canonical URI place images", () => {
  it("maps supplied photos by stable location id and keeps files on disk", () => {
    for (const id of SUPPLIED_IDS) {
      const url = PLACE_IMAGES[id];
      expect(url).toMatch(/^\/images\/places\/uri\//);
      expect(url).not.toMatch(/\/icons\/locations\//);
      expect(url).not.toMatch(/\/quad-feed\//);
      expect(placeCardImage(id)).toBe(url);
      expect(getRealmLocationHeroImage(id)).toBe(url);
      expect(existsSync(`public${url}`)).toBe(true);
    }
  });

  it("does not invent photos for locations that were not supplied", () => {
    expect(placeCardImage("library")).toBe("/maps/uri-campus-map.png");
    expect(placeCardImage("library")).not.toMatch(/\/quad-feed\/library/);
    expect(placeCardImage("engineering-hall")).not.toMatch(/group-study/);
    expect(placeCardImage("engineering-hall")).not.toMatch(/\/maps\/uri-campus-map/);
    expect(placeCardImage("the-quad")).not.toMatch(/uri-campus-map-fantasy/);
  });

  it("rejects cartoon icon fallbacks in favor of the canonical photo", () => {
    expect(placeCardImage("the-quad", "/icons/locations/the-quad.png")).toBe(
      "/images/places/uri/uri-quad.jpg",
    );
    expect(placeCardImageAlt("library")).toMatch(/Carothers Library/);
    expect(placeCardImageObjectPosition("rec-center")).toBe("38% 48%");
    expect(placeCardImageObjectPosition("engineering-hall")).toBe("center 48%");
    expect(placeCardImage("engineering-hall")).toBe("/images/places/uri/fascitelli-engineering.jpg");
    expect(placeCardImage("rec-center")).toBe("/images/places/uri/fascitelli-fitness.jpg");
  });
});
