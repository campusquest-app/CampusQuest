import { describe, expect, it } from "vitest";
import {
  isOnboardingTutorialDisabled,
  isTutorialChainUiComplete,
  ONBOARDING_TUTORIAL_DISABLED,
  shouldSkipStarterIntroOverlay,
} from "@/lib/client/onboardingTutorialGating";

describe("onboardingTutorialGating", () => {
  it("tutorial UI is disabled app-wide", () => {
    expect(ONBOARDING_TUTORIAL_DISABLED).toBe(true);
    expect(isOnboardingTutorialDisabled()).toBe(true);
  });

  it("skips intro overlay for all profiles when tutorial disabled", () => {
    expect(
      shouldSkipStarterIntroOverlay({
        profile: {},
        claimCountFromServer: 0,
        lsIntroMarkedSeen: false,
      }),
    ).toBe(true);
  });

  it("marks tutorial chain UI complete when tutorial disabled", () => {
    expect(
      isTutorialChainUiComplete({
        beginnerStatus: { claims: [] },
        celebrationAcknowledgedMerged: false,
      }),
    ).toBe(true);
  });
});
