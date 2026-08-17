import { describe, expect, it } from "vitest";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  carouselMaxItemsErrorMessage,
  clampCarouselIndex,
  filterCarouselFiles,
  filterRenderableCarouselMedia,
  isHeicLikeFile,
  looksLikeImageFile,
  looksLikeVideoFile,
  mediaFileFingerprint,
  removeFailedCarouselMedia,
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

describe("filterRenderableCarouselMedia", () => {
  const valid = (id: string, overrides: Partial<import("@/lib/quadMedia").QuadCarouselMediaDto> = {}) => ({
    id,
    mediaType: "image" as const,
    sortOrder: 0,
    url: `https://cdn.example.com/${id}.jpg`,
    thumbnailUrl: null,
    mimeType: "image/jpeg",
    fileSizeBytes: 1000,
    durationSeconds: null,
    width: 100,
    height: 100,
    hasAudio: false,
    processingStatus: "ready" as const,
    ...overrides,
  });

  it("keeps a single valid image", () => {
    expect(filterRenderableCarouselMedia([valid("a")])).toHaveLength(1);
  });

  it("keeps two valid images", () => {
    expect(filterRenderableCarouselMedia([valid("a"), valid("b", { sortOrder: 1 })])).toHaveLength(2);
  });

  it("drops null/empty URLs and failed processing status", () => {
    const items = [
      valid("ok"),
      valid("empty", { url: "" }),
      valid("blank", { url: "   " }),
      valid("failed", { processingStatus: "failed" }),
      valid("uploading", { processingStatus: "uploading" }),
      null,
      undefined,
    ];
    expect(filterRenderableCarouselMedia(items).map((m) => m.id)).toEqual(["ok"]);
  });

  it("supports mixed valid video + broken image filtering via helpers", () => {
    const video = valid("vid", { mediaType: "video", url: "https://cdn.example.com/v.mp4" });
    const broken = valid("broken", { url: "" });
    expect(filterRenderableCarouselMedia([video, broken]).map((m) => m.id)).toEqual(["vid"]);
    expect(filterRenderableCarouselMedia([broken, video]).map((m) => m.id)).toEqual(["vid"]);
  });

  it("collapses when all media are broken", () => {
    expect(
      filterRenderableCarouselMedia([
        valid("a", { url: "" }),
        valid("b", { processingStatus: "failed" }),
      ]),
    ).toEqual([]);
  });

  it("clamps index after removing the active final slide", () => {
    const items = [valid("a"), valid("b"), valid("c")];
    expect(removeFailedCarouselMedia(items, "c", 2)).toEqual({
      items: [items[0], items[1]],
      index: 1,
    });
    expect(removeFailedCarouselMedia(items, "a", 0).index).toBe(0);
    expect(removeFailedCarouselMedia([valid("only")], "only", 0)).toEqual({ items: [], index: 0 });
  });

  it("updates pagination length after a failed item is removed", () => {
    const before = [valid("a"), valid("b")];
    const after = removeFailedCarouselMedia(before, "b", 1);
    expect(after.items).toHaveLength(1);
    expect(clampCarouselIndex(after.index, after.items.length)).toBe(0);
  });
});
