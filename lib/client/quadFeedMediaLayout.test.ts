import { describe, expect, it } from "vitest";
import {
  expectedFeedMediaHeightPx,
  feedMediaAspectRatioCss,
  feedMediaFrameStyle,
  hasUsableMediaDimensions,
  isLandscapeMedia,
  isPortraitMedia,
  QUAD_FEED_MEDIA_FALLBACK_ASPECT,
} from "@/lib/client/quadFeedMediaLayout";

describe("quad feed media layout", () => {
  it("rejects zero / non-finite dimensions", () => {
    expect(hasUsableMediaDimensions(0, 100)).toBe(false);
    expect(hasUsableMediaDimensions(100, null)).toBe(false);
    expect(hasUsableMediaDimensions(1080, 1920)).toBe(true);
  });

  it("uses 4/5 fallback when dimensions are missing", () => {
    expect(feedMediaAspectRatioCss(null, null)).toBe(QUAD_FEED_MEDIA_FALLBACK_ASPECT);
    expect(feedMediaFrameStyle(null, null).aspectRatio).toBe("4 / 5");
  });

  it("reserves portrait aspect without collapsing to a strip", () => {
    const style = feedMediaFrameStyle(1080, 1920);
    expect(style.aspectRatio).toBe("1080 / 1920");
    expect(style.maxHeight).toContain("60vh");
    const height = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1080,
      height: 1920,
      maxHeightPx: 506,
    });
    expect(height).toBeGreaterThan(200);
    expect(height).toBeLessThanOrEqual(506);
    expect(height).toBeCloseTo(506, 0);
  });

  it("reserves landscape aspect shorter than portrait", () => {
    const portrait = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1080,
      height: 1920,
      maxHeightPx: 506,
    });
    const landscape = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1920,
      height: 1080,
      maxHeightPx: 506,
    });
    expect(landscape).toBeLessThan(portrait);
    expect(landscape).toBeCloseTo((390 * 1080) / 1920, 1);
    expect(isPortraitMedia(1080, 1920)).toBe(true);
    expect(isLandscapeMedia(1920, 1080)).toBe(true);
  });

  it("fillParent mode clears nested aspect so carousel owns the box", () => {
    const style = feedMediaFrameStyle(1080, 1920, { fillParent: true });
    expect(style.aspectRatio).toBe("auto");
    expect(style.height).toBe("100%");
    expect(style["--cq-media-ar"]).toBe("1080 / 1920");
  });

  it("fallback placeholder height is stable (not 0, not full 60vh for unknown)", () => {
    const h = expectedFeedMediaHeightPx({
      containerWidth: 390,
      maxHeightPx: 506,
    });
    expect(h).toBeCloseTo((390 * 5) / 4, 1);
    expect(h).toBeGreaterThan(100);
    expect(h).toBeLessThanOrEqual(506);
  });
});
