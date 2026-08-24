import { describe, expect, it } from "vitest";
import {
  isDisplayNameSetupRequired,
  isDisplayNameValid,
  normalizeDisplayNameInput,
} from "@/lib/onboarding/displayNameOnboardingPolicy";
import { resolveAppShellRoute, resolveProfileRoute } from "@/lib/client/appShellRoute";

describe("displayNameOnboardingPolicy", () => {
  it("requires display name setup for incomplete users without display_name_changed_at", () => {
    expect(
      isDisplayNameSetupRequired({
        onboarding_completed: false,
        onboarding_character_completed: false,
        display_name_changed_at: null,
      }),
    ).toBe(true);
  });

  it("skips once display_name_changed_at is set", () => {
    expect(
      isDisplayNameSetupRequired({
        onboarding_completed: false,
        onboarding_character_completed: false,
        display_name_changed_at: "2026-08-21T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("never forces completed character users", () => {
    expect(
      isDisplayNameSetupRequired({
        onboarding_character_completed: true,
        display_name_changed_at: null,
      }),
    ).toBe(false);
  });

  it("validates display names", () => {
    expect(isDisplayNameValid("")).toBe(false);
    expect(isDisplayNameValid("NileLotus")).toBe(true);
    expect(normalizeDisplayNameInput("  NileLotus  ")).toBe("NileLotus");
  });
});

describe("display name → demographics → CharacterGate routing", () => {
  it("routes new signup to display name before demographics", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: false,
        onboarding_character_completed: false,
        role: null,
        display_name_changed_at: null,
      }),
    ).toBe("display_name_gate");

    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          onboarding_character_completed: false,
          role: null,
          display_name_changed_at: "2026-08-21T00:00:00Z",
        },
        { preferences: { interests: [] } },
      ),
    ).toBe("demographics_gate");

    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "display_name_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("display_name");
  });

  it("keeps CharacterGate after demographics when display name is done", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          onboarding_character_completed: false,
          role: null,
          display_name_changed_at: "2026-08-21T00:00:00Z",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
        },
        { preferences: { interests: ["a", "b", "c"] } },
      ),
    ).toBe("character_gate");
  });
});
