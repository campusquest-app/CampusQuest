import { describe, expect, it } from "vitest";
import {
  buildDiceBearCreateOptions,
  clampDiceBearScale,
  DICEBEAR_SAFE_FRAME,
  stripSvgClipPaths,
} from "@/lib/dicebearFrame";

describe("dicebearFrame", () => {
  it("clamps unsafe scale values to 75", () => {
    expect(clampDiceBearScale(120)).toBe(75);
    expect(clampDiceBearScale(100)).toBe(75);
    expect(clampDiceBearScale(75)).toBe(75);
    expect(clampDiceBearScale(70)).toBe(70);
  });

  it("builds safe create options and strips framing overrides from appearance", () => {
    const opts = buildDiceBearCreateOptions({
      seed: "CQ Rhody Knight",
      options: {
        scale: 120,
        translateX: 12,
        translateY: -40,
        radius: 0,
        size: 48,
        backgroundColor: ["041e42"],
        hair: ["variant01"],
      },
    });

    expect(opts).toMatchObject({
      seed: "CQ Rhody Knight",
      size: DICEBEAR_SAFE_FRAME.size,
      scale: 75,
      translateX: 0,
      translateY: 0,
      radius: 50,
      backgroundColor: ["041e42"],
      hair: ["variant01"],
    });
    expect(opts.size).toBe(128);
  });

  it("removes clip paths from svg markup", () => {
    const svg =
      '<svg><defs><clipPath id="a"><rect width="10" height="10"/></clipPath></defs><g clip-path="url(#a)"></g></svg>';
    const cleaned = stripSvgClipPaths(svg);
    expect(cleaned).not.toContain("clipPath");
    expect(cleaned).not.toContain("clip-path");
  });
});
