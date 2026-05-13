import { describe, expect, it } from "vitest";
import {
  isTutorialChainUiComplete,
  shouldSkipStarterIntroOverlay,
} from "@/lib/client/onboardingTutorialGating";

describe("onboardingTutorialGating", () => {
  it("skip intro when onboarding_completed regardless of LS", () => {
    expect(
      shouldSkipStarterIntroOverlay({
        profile: {
          onboarding_completed: true,
          starter_intro_seen_at: null,
          beginner_chain_completed_at: null,
          beginner_chain_celebration_seen_at: null,
        },
        claimCountFromServer: 0,
        lsIntroMarkedSeen: false,
      }),
    ).toBe(true);
  });

  it("skip intro when all claims synced from server without LS marker", () => {
    expect(
      shouldSkipStarterIntroOverlay({
        profile: {},
        claimCountFromServer: 5,
        lsIntroMarkedSeen: false,
      }),
    ).toBe(true);
  });

  it("shows intro gate when brand-new profile offline server shape", () => {
    expect(
      shouldSkipStarterIntroOverlay({
        profile: {},
        claimCountFromServer: 0,
        lsIntroMarkedSeen: false,
      }),
    ).toBe(false);
  });

  it("tutorial panel complete requires all claims plus celebration acknowledgement", () => {
    expect(
      isTutorialChainUiComplete({
        beginnerStatus: { claims: [{ questKey: "profile" }] },
        celebrationAcknowledgedMerged: true,
      }),
    ).toBe(false);

    expect(
      isTutorialChainUiComplete({
        beginnerStatus: {
          claims: [
            { questKey: "profile" },
            { questKey: "activity" },
            { questKey: "boss" },
            { questKey: "leaderboard" },
            { questKey: "guild" },
          ],
          beginnerChainCelebrationSeenAt: "2026-05-01T00:00:00.000Z",
        },
        celebrationAcknowledgedMerged: false,
      }),
    ).toBe(true);

    expect(
      isTutorialChainUiComplete({
        beginnerStatus: {
          claims: [
            { questKey: "profile" },
            { questKey: "activity" },
            { questKey: "boss" },
            { questKey: "leaderboard" },
            { questKey: "guild" },
          ],
        },
        celebrationAcknowledgedMerged: true,
      }),
    ).toBe(true);
  });
});
