import { describe, expect, it } from "vitest";
import {
  LAUNCH_SPLASH_SPECK_COUNT,
  SPLASH_LAUNCH_FADEOUT_MS,
  SPLASH_LAUNCH_INTRO_MS,
} from "@/components/welcome/splashTiming";

describe("launch splash timing", () => {
  it("keeps fade-out short and does not introduce a multi-second delay", () => {
    expect(SPLASH_LAUNCH_FADEOUT_MS).toBeGreaterThan(0);
    expect(SPLASH_LAUNCH_FADEOUT_MS).toBeLessThanOrEqual(400);
    expect(SPLASH_LAUNCH_INTRO_MS).toBeGreaterThanOrEqual(800);
    expect(SPLASH_LAUNCH_INTRO_MS).toBeLessThanOrEqual(1400);
  });

  it("uses a small atmospheric speck count", () => {
    expect(LAUNCH_SPLASH_SPECK_COUNT).toBeGreaterThanOrEqual(8);
    expect(LAUNCH_SPLASH_SPECK_COUNT).toBeLessThanOrEqual(16);
  });
});
