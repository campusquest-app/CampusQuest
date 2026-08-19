import { describe, expect, it } from "vitest";
import { QUAD_SPARK_XP_AMOUNT } from "@/lib/quadSparkXp";
import { assertSafeXpGrant } from "@/lib/server/security";
import {
  isQuadCommunityChannel,
  QUAD_COMMUNITY_CHANNELS,
  QUAD_COMMUNITY_FEED_LABELS,
} from "@/lib/quadCommunityChannels";

describe("quad spark XP", () => {
  it("awards +20 XP per spark grant and passes the XP cap", () => {
    expect(QUAD_SPARK_XP_AMOUNT).toBe(20);
    expect(() => assertSafeXpGrant("quad_spark", QUAD_SPARK_XP_AMOUNT)).not.toThrow();
  });

  it("rejects spark XP above the cap", () => {
    expect(() => assertSafeXpGrant("quad_spark", 21)).toThrow(/XP amount out of allowed range/);
  });
});

describe("quad community channels", () => {
  it("exposes the three dedicated community feeds", () => {
    expect(QUAD_COMMUNITY_CHANNELS).toEqual(["student_organizations", "greek_life", "athletics"]);
    expect(isQuadCommunityChannel("greek_life")).toBe(true);
    expect(isQuadCommunityChannel("public")).toBe(false);
    for (const channel of QUAD_COMMUNITY_CHANNELS) {
      expect(QUAD_COMMUNITY_FEED_LABELS[channel].label.length).toBeGreaterThan(0);
    }
  });
});
