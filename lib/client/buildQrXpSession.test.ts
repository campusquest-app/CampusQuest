import { describe, expect, it } from "vitest";
import { buildQrXpSession } from "@/lib/client/buildQrXpSession";

describe("buildQrXpSession", () => {
  it("uses explicit xpGained when before and after totals match", () => {
    const session = buildQrXpSession({
      beforeTotalXP: 1000,
      afterTotalXP: 1000,
      xpGained: 25,
      title: "AI Lab logged!",
      activityLabel: "AI Lab",
      stats: {},
      leveledUp: false,
    });

    expect(session.xpGained).toBe(25);
    expect(session.afterTotalXP).toBe(1025);
    expect(session.rewardSnapshot?.xpGained).toBe(25);
    expect(session.rewardSnapshot?.finalXP).toBe(1025);
  });

  it("prefers server total delta when it is larger than explicit xp", () => {
    const session = buildQrXpSession({
      beforeTotalXP: 100,
      afterTotalXP: 150,
      xpGained: 25,
      title: "Quest logged!",
      activityLabel: "Quest",
      stats: {},
      leveledUp: false,
    });

    expect(session.xpGained).toBe(50);
    expect(session.afterTotalXP).toBe(150);
  });
});
