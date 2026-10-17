import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS } from "@/lib/client/quadVideoLoadGate";
import { expectedFeedMediaHeightPx } from "@/lib/client/quadFeedMediaLayout";

const root = join(__dirname, "..", "..");
const carousel = readFileSync(join(root, "components/quad/QuadMediaCarousel.tsx"), "utf8");
const theQuad = readFileSync(join(root, "components/TheQuad.tsx"), "utf8");

describe("quad feed scroll media behavior", () => {
  it("defers offscreen carousel media until near the viewport", () => {
    expect(carousel).toContain("useNearViewport");
    expect(carousel).toContain('rootMargin: "240px 0px"');
    expect(carousel).toContain("shouldLoadMedia");
    expect(carousel).toContain("loadSrc={shouldLoadMedia}");
  });

  it("prioritizes only the first post in the feed stream", () => {
    expect(theQuad).toContain("priorityPostId");
    expect(theQuad).toContain("priorityMedia={item.note.id === priorityPostId}");
  });

  it("never allows more than one concurrent video download slot", () => {
    expect(QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS).toBe(1);
  });

  it("keeps reserved height while scrolling past unloaded media", () => {
    // Simulates a portrait post still offscreen: box height stays reserved.
    const reserved = expectedFeedMediaHeightPx({
      containerWidth: 390,
      width: 1080,
      height: 1920,
      maxHeightPx: 506,
    });
    expect(reserved).toBe(506);
  });
});
