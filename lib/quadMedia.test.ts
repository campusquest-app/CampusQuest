import { describe, expect, it } from "vitest";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  carouselMaxItemsErrorMessage,
  filterCarouselFiles,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";

describe("quad carousel media limits", () => {
  it("caps at 15 items", () => {
    expect(QUAD_CAROUSEL_MAX_ITEMS).toBe(15);
    expect(carouselMaxItemsErrorMessage()).toContain("15");
  });

  it("resolves total upload bytes", () => {
    expect(resolveQuadPostTotalUploadBytes("524288000")).toBe(524288000);
    expect(resolveQuadPostTotalUploadBytes("100")).toBe(500 * 1024 * 1024);
  });

  it("prevents duplicate fingerprints and rejects a 16th item", () => {
    const existing = Array.from({ length: 15 }, (_, i) => ({
      fingerprint: mediaFileFingerprint({
        name: `a${i}.jpg`,
        size: 10 + i,
        lastModified: 1000 + i,
        type: "image/jpeg",
      }),
    }));
    const { acceptedIndexes, rejectedReason } = filterCarouselFiles(existing, [
      { name: "z.jpg", size: 99, lastModified: 9, type: "image/jpeg" },
    ]);
    expect(acceptedIndexes).toHaveLength(0);
    expect(rejectedReason).toBe(carouselMaxItemsErrorMessage());

    const fourteen = existing.slice(0, 14);
    const dup = {
      name: "a0.jpg",
      size: 10,
      lastModified: 1000,
      type: "image/jpeg",
    };
    expect(filterCarouselFiles(fourteen, [dup]).acceptedIndexes).toHaveLength(0);
    expect(
      filterCarouselFiles(fourteen, [{ name: "new.jpg", size: 1, lastModified: 1, type: "image/jpeg" }])
        .acceptedIndexes,
    ).toHaveLength(1);
  });

  it("builds stable fingerprints", () => {
    const file = { name: "p.jpg", size: 3, lastModified: 123, type: "image/jpeg" };
    expect(mediaFileFingerprint(file)).toContain("p.jpg");
    expect(mediaFileFingerprint(file)).toBe(mediaFileFingerprint(file));
  });
});
