import { describe, expect, it } from "vitest";
import {
  isAppShellDecisionReady,
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
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "student",
        campus_email_verified_at: null,
        display_name_changed_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("demographics_gate");
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: null,
          role: "student",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a", "b", "c"], institutionId: "uri" }, forceDemographicsQaReplay: false },
      ),
    ).toBe("character_gate");
    // Brand-new incomplete profiles hit display name before demographics.
    expect(resolveProfileRoute({ onboarding_character_completed: null, role: "student" })).toBe(
      "display_name_gate",
    );
    expect(
      resolveProfileRoute(
        { onboarding_character_completed: null, role: "student", display_name_changed_at: "2026-01-01T00:00:00.000Z" },
        { preferences: { interests: [] } },
      ),
    ).toBe("demographics_gate");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "faculty_staff" })).toBe("app");
  });

  it("routes new users through display name then demographics before character onboarding", () => {
    expect(resolveProfileRoute({ onboarding_completed: false, role: null })).toBe("display_name_gate");
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          role: null,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: [] } },
      ),
    ).toBe("demographics_gate");
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          role: null,
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a", "b", "c"] } },
      ),
    ).toBe("character_gate");
    // Existing onboarded user with NULL/legacy-invalid role: standalone role prompt.
    expect(resolveProfileRoute({ onboarding_completed: true, role: null })).toBe("role_gate");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "" })).toBe("role_gate");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "banana" })).toBe("role_gate");
  });

  it("never shows the role gate to admins or internal testers", () => {
    expect(resolveProfileRoute({ onboarding_completed: true, role: "admin" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "super_admin" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: true, role: "beta_internal" })).toBe("app");
    expect(resolveProfileRoute({ onboarding_completed: false, role: "admin" })).toBe("display_name_gate");
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          role: "admin",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a", "b", "c"] } },
      ),
    ).toBe("character_gate");
  });

  it("routes QA accounts by their separate test selection, keeping role = qa", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: false,
        role: "qa",
        is_test_user: true,
        qa_selected_role: null,
      }),
    ).toBe("display_name_gate");
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          role: "qa",
          is_test_user: true,
          qa_selected_role: "student",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a", "b", "c"] } },
      ),
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

  it("does not bounce completed users between app and onboarding", () => {
    const profileRoute = resolveProfileRoute({
      onboarding_completed: true,
      onboarding_character_completed: true,
      role: "student",
      student_status: "faculty_staff",
      institution_id: "uri",
      onboarding_version: 2,
      campus_email_verified_at: "2026-01-01T00:00:00.000Z",
    }, { preferences: { interests: ["career", "tech", "clubs"] } });
    expect(profileRoute).toBe("app");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute,
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

  it("routes demographics gate to the demographics shell", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "demographics_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("demographics");
  });

  it("is ready for demographics without a hydrated character", () => {
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "authenticated",
        profileRoute: "demographics_gate",
        hasCharacter: false,
      }),
    ).toBe(true);
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

  it("is ready only after a real auth/setup/app decision", () => {
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "bootstrapping",
        profileRoute: "unknown",
        hasCharacter: false,
      }),
    ).toBe(false);
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "unauthenticated",
        profileRoute: "unknown",
        hasCharacter: false,
      }),
    ).toBe(true);
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "authenticated",
        profileRoute: "unknown",
        hasCharacter: false,
      }),
    ).toBe(false);
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "authenticated",
        profileRoute: "character_gate",
        hasCharacter: false,
      }),
    ).toBe(true);
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        hasCharacter: false,
      }),
    ).toBe(false);
    expect(
      isAppShellDecisionReady({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        hasCharacter: true,
      }),
    ).toBe(true);
  });
});
