import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedFeedMediaHeightPx, feedMediaFrameStyle } from "@/lib/client/quadFeedMediaLayout";
import { buildQuadFeedImageSources } from "@/lib/client/quadFeedImageUrl";

const root = join(__dirname, "..", "..");
const carousel = readFileSync(join(root, "components/quad/QuadMediaCarousel.tsx"), "utf8");
const player = readFileSync(join(root, "components/quad/QuadVideoPlayer.tsx"), "utf8");
const zoomable = readFileSync(join(root, "components/quad/ZoomableImage.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const nextConfig = readFileSync(join(root, "next.config.js"), "utf8");

describe("Quad feed media performance regressions", () => {
  it("reserves aspect-ratio on the carousel so empty frames are not 0-height strips", () => {
    expect(css).toMatch(/\.cq-quad-media-carousel\s*\{[\s\S]*aspect-ratio:\s*var\(--cq-media-ar\)/);
    expect(carousel).toContain("feedMediaFrameStyle");
    expect(carousel).toContain("priority");
    expect(carousel).toContain("useNearViewport");
  });

  it("lazy-loads images and prioritizes the first visible post", () => {
    expect(zoomable).toContain('loading={priority ? "eager" : "lazy"}');
    expect(zoomable).toContain("fetchPriority");
    expect(zoomable).toContain("buildQuadFeedImageSources");
    expect(zoomable).toContain("Retry");
  });

  it("loads video metadata only when near viewport and gates concurrent downloads", () => {
    expect(player).toContain('preload={attachedSrc ? "metadata" : "none"}');
    expect(player).toContain("acquireVideoLoadSlot");
    expect(player).toContain("allowLoad");
    expect(player).toContain("posterHref");
    expect(player).toContain("VIDEO_LOAD_TIMEOUT_MS");
    expect(player).toContain("Retry");
  });

  it("configures Next image remotePatterns for Supabase storage", () => {
    expect(nextConfig).toContain("remotePatterns");
    expect(nextConfig).toContain("supabase.co");
    expect(nextConfig).toContain("/storage/v1/object/public/**");
  });

  it("sizes portrait and landscape media differently under the feed max height", () => {
    const maxH = 506;
    const portrait = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1080,
      height: 1920,
      maxHeightPx: maxH,
    });
    const landscape = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1920,
      height: 1080,
      maxHeightPx: maxH,
    });
    expect(portrait).toBe(maxH);
    expect(landscape).toBeLessThan(300);
    expect(feedMediaFrameStyle(1920, 1080).aspectRatio).toBe("1920 / 1080");
  });

  it("keeps original media URL as fallback when variants fail", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/quad-post-images/u/posts/a.jpg";
    const built = buildQuadFeedImageSources(url);
    expect(built.fallbackSrc).toBe(url);
    expect(built.src).not.toBe(url);
  });

  it("does not mount full video players for far carousel slides without a nearby gate", () => {
    expect(carousel).toContain("shouldLoadMedia");
    expect(carousel).toContain("cq-quad-media-slide-placeholder");
    expect(carousel).toContain("allowLoad={shouldLoadMedia && (active || nearby)}");
  });
});
