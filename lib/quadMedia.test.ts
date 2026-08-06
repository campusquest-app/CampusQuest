import { describe, expect, it } from "vitest";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  carouselMaxItemsErrorMessage,
  filterCarouselFiles,
  isHeicLikeFile,
  looksLikeImageFile,
  looksLikeVideoFile,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";
import { sniffImageMimeFromBuffer } from "@/lib/server/sniffImageMime";

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

  it("accepts Android gallery images with empty MIME via extension", () => {
    expect(looksLikeImageFile({ name: "IMG_1234.jpg", type: "" })).toBe(true);
    expect(looksLikeImageFile({ name: "photo.JPEG", type: "" })).toBe(true);
    expect(looksLikeImageFile({ name: "shot.png", type: "" })).toBe(true);
    expect(looksLikeImageFile({ name: "shot.webp", type: "" })).toBe(true);
    expect(looksLikeImageFile({ name: "photo.heic", type: "" })).toBe(true);
    expect(looksLikeImageFile({ name: "not-an-image.txt", type: "" })).toBe(false);
    expect(looksLikeImageFile({ name: "x.bin", type: "image/jpeg" })).toBe(true);
  });

  it("detects HEIC and common video extensions without MIME", () => {
    expect(isHeicLikeFile({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(looksLikeVideoFile({ name: "clip.mp4", type: "" })).toBe(true);
    expect(looksLikeVideoFile({ name: "clip.MOV", type: "" })).toBe(true);
    expect(looksLikeVideoFile({ name: "clip.webm", type: "" })).toBe(true);
    expect(looksLikeVideoFile({ name: "photo.jpg", type: "" })).toBe(false);
  });

  it("sniffs JPEG/PNG/WebP and HEIC brands from magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageMimeFromBuffer(jpeg)).toBe("image/jpeg");

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMimeFromBuffer(png)).toBe("image/png");

    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    expect(sniffImageMimeFromBuffer(webp)).toBe("image/webp");

    const heic = Buffer.alloc(12);
    heic.write("....", 0);
    heic.write("ftyp", 4);
    heic.write("heic", 8);
    expect(sniffImageMimeFromBuffer(heic)).toBe("image/heic");

    expect(sniffImageMimeFromBuffer(Buffer.from([0x00]), "camera.JPG")).toBe("image/jpeg");
  });
});
