import { describe, expect, it } from "vitest";
import { QUAD_COMMUNITY_CHANNELS } from "@/lib/quadCommunityChannels";
import { QUAD_FEED_OPTIONS } from "@/lib/client/quadFeedOptions";

describe("quad community feeds remain intact with The Market", () => {
  it("keeps Organizations, Greek Life, and Athletics as dedicated Quad channels", () => {
    expect(QUAD_COMMUNITY_CHANNELS).toEqual(["student_organizations", "greek_life", "athletics"]);
    expect(QUAD_FEED_OPTIONS.some((row) => row.tab === "market")).toBe(true);
    expect(QUAD_COMMUNITY_CHANNELS.includes("market" as never)).toBe(false);
  });
});
