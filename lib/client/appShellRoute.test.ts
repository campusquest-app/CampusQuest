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

  it("hydrates quietly during bootstrap when not post-login", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "bootstrapping",
        profileRoute: "unknown",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("hydrating");

    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "unknown",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("hydrating");
  });

  it("shows full-screen loading only during post-login boot", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "bootstrapping",
        profileRoute: "unknown",
        showPostLoginLoading: true,
        hasCharacter: false,
      }),
    ).toBe("loading");

    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        showPostLoginLoading: true,
        hasCharacter: true,
      }),
    ).toBe("loading");
  });

  it("routes existing users to app without onboarding flash", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        showPostLoginLoading: false,
        hasCharacter: true,
      }),
    ).toBe("app");
  });

  it("routes new users to onboarding only after profile route resolves", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "character_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("onboarding");
  });
});
