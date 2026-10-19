import { describe, expect, it, beforeEach } from "vitest";
import {
  nextAutoplayEligible,
  registerFeedVideoAutoplay,
  reportFeedVideoVisibility,
  resetFeedVideoAutoplayForTests,
  getActiveFeedVideoAutoplayId,
  QUAD_VIDEO_PLAY_RATIO,
  QUAD_VIDEO_PAUSE_RATIO,
} from "@/lib/client/quadFeedVideoAutoplay";

describe("quad feed video autoplay hysteresis", () => {
  it("plays at 60% and pauses below 30%, holding state in between", () => {
    expect(nextAutoplayEligible(0.6, false)).toBe(true);
    expect(nextAutoplayEligible(0.45, true)).toBe(true);
    expect(nextAutoplayEligible(0.45, false)).toBe(false);
    expect(nextAutoplayEligible(0.29, true)).toBe(false);
    expect(nextAutoplayEligible(QUAD_VIDEO_PLAY_RATIO, false)).toBe(true);
    expect(nextAutoplayEligible(QUAD_VIDEO_PAUSE_RATIO - 0.01, true)).toBe(false);
  });
});

describe("quad feed video autoplay arbitration", () => {
  beforeEach(() => {
    resetFeedVideoAutoplayForTests();
  });

  it("plays only the most visible eligible video", () => {
    const a: boolean[] = [];
    const b: boolean[] = [];
    registerFeedVideoAutoplay("a", (v) => a.push(v));
    registerFeedVideoAutoplay("b", (v) => b.push(v));

    reportFeedVideoVisibility("a", 0.65);
    expect(getActiveFeedVideoAutoplayId()).toBe("a");
    expect(a.at(-1)).toBe(true);
    const aCallsAfterFirst = a.length;

    // Same winner — do not re-notify (would override a manual pause).
    reportFeedVideoVisibility("a", 0.7);
    expect(a.length).toBe(aCallsAfterFirst);

    reportFeedVideoVisibility("b", 0.9);
    expect(getActiveFeedVideoAutoplayId()).toBe("b");
    expect(a.at(-1)).toBe(false);
    expect(b.at(-1)).toBe(true);

    reportFeedVideoVisibility("b", 0.2);
    expect(getActiveFeedVideoAutoplayId()).toBe("a");
  });
});
