import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("recommendation profile API", () => {
  const routeSrc = readFileSync(join(process.cwd(), "app/api/me/recommendation-profile/route.ts"), "utf8");
  const loaderSrc = readFileSync(join(process.cwd(), "lib/server/recommendationProfile.ts"), "utf8");

  it("requires an authenticated user", () => {
    expect(routeSrc).toContain("requireAuthUser");
    expect(routeSrc).toContain("loadUserRecommendationProfile");
  });

  it("does not force debug metadata on for every caller", () => {
    expect(routeSrc).not.toContain("includeDebug: true");
    expect(loaderSrc).toContain("shouldExposeRecommendationDebug");
  });

  it("loads preference and behavior signals in parallel", () => {
    expect(loaderSrc).toContain("Promise.all");
    expect(loaderSrc).toContain("user_onboarding_preferences");
    expect(loaderSrc).toContain("event_rsvps");
    expect(loaderSrc).toContain("organization_members");
    expect(loaderSrc).toContain("qr_scans");
  });
});
