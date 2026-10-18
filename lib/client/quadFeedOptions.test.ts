import { describe, expect, it } from "vitest";
import { QUAD_COMMUNITY_CHANNELS } from "@/lib/quadCommunityChannels";
import { QUAD_FEED_OPTIONS, quadFeedOptionsByGroup } from "@/lib/client/quadFeedOptions";

describe("quad community feeds remain intact with The Market", () => {
  it("keeps Organizations, Greek Life, and Athletics as dedicated Quad channels", () => {
    expect(QUAD_COMMUNITY_CHANNELS).toEqual(["student_organizations", "greek_life", "athletics"]);
    expect(QUAD_FEED_OPTIONS.some((row) => row.tab === "market")).toBe(true);
    expect(QUAD_COMMUNITY_CHANNELS.includes("market" as never)).toBe(false);
  });

  it("groups every existing feed exactly once", () => {
    const grouped = quadFeedOptionsByGroup().flatMap((group) => group.options.map((option) => option.tab));
    expect(grouped.sort()).toEqual(QUAD_FEED_OPTIONS.map((option) => option.tab).sort());
    expect(new Set(grouped).size).toBe(QUAD_FEED_OPTIONS.length);
    expect(quadFeedOptionsByGroup().map((group) => group.label)).toEqual([
      "Campus",
      "Communities",
      "Around campus",
    ]);
  });
});
