import { describe, expect, it } from "vitest";
import {
  buildQuadFeedImageSources,
  pickFeedImageWidth,
  toNextImageOptimizerUrl,
  toSupabaseImageTransformUrl,
} from "@/lib/client/quadFeedImageUrl";

const OBJECT =
  "https://abc.supabase.co/storage/v1/object/public/quad-post-images/user1/posts/photo.jpg";

describe("quad feed image urls", () => {
  it("rewrites public object URLs to Supabase image transforms", () => {
    const href = toSupabaseImageTransformUrl(OBJECT, 720, 72);
    expect(href).toContain("/storage/v1/render/image/public/quad-post-images/user1/posts/photo.jpg?");
    expect(href).toContain("width=720");
    expect(href).toContain("quality=72");
    expect(href).toContain("resize=contain");
  });

  it("builds a responsive srcSet with original fallback", () => {
    const built = buildQuadFeedImageSources(OBJECT, { displayWidthPx: 390 });
    expect(built.fallbackSrc).toBe(OBJECT);
    expect(built.usesVariant).toBe(true);
    expect(built.srcSet).toContain("360w");
    expect(built.srcSet).toContain("720w");
    expect(built.srcSet).toContain("1080w");
    expect(built.src).toContain("render/image/public");
  });

  it("falls back to Next optimizer for non-supabase hosts", () => {
    const url = "https://cdn.example.com/a.jpg";
    expect(toSupabaseImageTransformUrl(url, 720)).toBeNull();
    expect(toNextImageOptimizerUrl(url, 720)).toBe(
      `/_next/image?url=${encodeURIComponent(url)}&w=720&q=72`,
    );
    const built = buildQuadFeedImageSources(url);
    expect(built.usesVariant).toBe(true);
    expect(built.src.startsWith("/_next/image?")).toBe(true);
    expect(built.fallbackSrc).toBe(url);
  });

  it("picks mobile-friendly widths (accounts for devicePixelRatio)", () => {
    // jsdom / node typically reports dpr=1; clamp path still returns a bucket.
    const w = pickFeedImageWidth(390);
    expect([360, 720, 1080]).toContain(w);
    expect(pickFeedImageWidth(120)).toBeGreaterThanOrEqual(360);
    expect(pickFeedImageWidth(2000)).toBe(1080);
  });
});

