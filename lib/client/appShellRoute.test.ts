import { describe, expect, it } from "vitest";
import {
  isProfileSetupComplete,
  resolveAppShellRoute,
  resolveProfileRoute,
} from "./appShellRoute";

describe("appShellRoute", () => {
  it("treats only explicit true flags as profile complete", () => {
    expect(isProfileSetupComplete({ onboarding_completed: true })).toBe(true);
    expect(isProfileSetupComplete({ onboarding_character_completed: true })).toBe(true);
    expect(isProfileSetupComplete({ onboarding_completed: false })).toBe(false);
    expect(isProfileSetupComplete({ onboarding_completed: null })).toBe(false);
    expect(isProfileSetupComplete({})).toBe(false);
  });

  it("resolves profile route from explicit completion flags", () => {
    expect(resolveProfileRoute({ onboarding_completed: true })).toBe("app");
    expect(resolveProfileRoute({ onboarding_character_completed: null })).toBe("character_gate");
  });

  it("keeps loading until bootstrap and profile route are known", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "bootstrapping",
        profileRoute: "unknown",
        showLaunchSplash: false,
        hasCharacter: false,
      }),
    ).toBe("loading");

    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "unknown",
        showLaunchSplash: false,
        hasCharacter: false,
      }),
    ).toBe("loading");
  });

  it("routes existing users to app without onboarding flash", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        showLaunchSplash: false,
        hasCharacter: true,
      }),
    ).toBe("app");
  });

  it("routes new users to onboarding only after profile route resolves", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "character_gate",
        showLaunchSplash: false,
        hasCharacter: false,
      }),
    ).toBe("onboarding");
  });
});
