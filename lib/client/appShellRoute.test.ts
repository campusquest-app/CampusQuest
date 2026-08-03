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

  it("resolves profile route from explicit completion flags once a role is chosen", () => {
    expect(resolveProfileRoute({ onboarding_completed: true, role: "student" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_character_completed: null, role: "student" })).toBe(
      "character_gate",
    );
    expect(resolveProfileRoute({ onboarding_completed: true, role: "faculty_staff" })).toBe("app");
  });

  it("routes new users without a role into combined character onboarding", () => {
    expect(resolveProfileRoute({ onboarding_completed: false, role: null })).toBe("character_gate");
    // Existing onboarded user with NULL/legacy-invalid role: standalone role prompt.
    expect(resolveProfileRoute({ onboarding_completed: true, role: null })).toBe("role_gate");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "" })).toBe("role_gate");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "banana" })).toBe("role_gate");
  });

  it("never shows the role gate to admins or internal testers", () => {
    expect(resolveProfileRoute({ onboarding_completed: true, role: "admin" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "super_admin" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "beta_internal" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: false, role: "admin" })).toBe("character_gate");
  });

  it("routes QA accounts by their separate test selection, keeping role = qa", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: false,
        role: "qa",
        is_test_user: true,
        qa_selected_role: null,
      }),
    ).toBe("character_gate");
    expect(
      resolveProfileRoute({
        onboarding_completed: false,
        role: "qa",
        is_test_user: true,
        qa_selected_role: "student",
      }),
    ).toBe("character_gate");
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "qa",
        is_test_user: true,
        qa_selected_role: "faculty_staff",
      }),
    ).toBe("app");
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

  it("shows the role-selection screen when the profile route requires it", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "role_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("role_selection");

    // Existing users keep their hydrated character while picking a role.
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "role_gate",
        showPostLoginLoading: false,
        hasCharacter: true,
      }),
    ).toBe("role_selection");
  });
});
