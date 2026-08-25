import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { campusEventToRecommendationEntity } from "@/lib/recommendations/adapters";
import { emptyRecommendationProfile } from "@/lib/recommendations/profile";
import { scoreRecommendationEntity } from "@/lib/recommendations/score";
import { formatRecommendationDebugLine } from "@/lib/recommendations/debug";

describe("recommendation debug UI safety", () => {
  const quadSrc = readFileSync(join(process.cwd(), "components/TheQuad.tsx"), "utf8");
  const eventsFeedSrc = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
  const eventCardSrc = readFileSync(join(process.cwd(), "components/events/EventDiscoveryCard.tsx"), "utf8");
  const dashboardSrc = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");

  it("does not render score-breakdown debug lines in Quad or Events UI", () => {
    expect(quadSrc).not.toContain("formatRecommendationDebugLine");
    expect(quadSrc).not.toContain("debugById");
    expect(quadSrc).not.toContain("showRecommendationDebug");
    expect(eventsFeedSrc).not.toContain("showRecommendationDebug");
    expect(eventCardSrc).not.toContain("formatRecommendationDebugLine");
    expect(eventCardSrc).not.toContain("showRecommendationDebug");
    expect(dashboardSrc).not.toContain("showRecommendationDebug");
  });

  it("keeps feed ranking and human recommendation reasons without raw score math", () => {
    expect(quadSrc).toContain("reasonById");
    expect(quadSrc).toContain("rankRecommendationEntities");
    expect(eventsFeedSrc).toContain("rankRecommendationEntities");
  });

  it("formats debug lines only when includeDebug attached a breakdown", () => {
    const entity = campusEventToRecommendationEntity({
      id: "e1",
      title: "Basketball",
      description: "",
      startsAt: "2026-08-26T18:00:00.000Z",
    });
    const now = Date.parse("2026-08-25T16:00:00.000Z");
    expect(formatRecommendationDebugLine(scoreRecommendationEntity(entity, emptyRecommendationProfile(), now))).toBeNull();
    expect(
      formatRecommendationDebugLine(
        scoreRecommendationEntity(entity, emptyRecommendationProfile({ includeDebug: true }), now),
      ),
    ).toMatch(/score /);
  });
});
