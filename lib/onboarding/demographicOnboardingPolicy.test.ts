import { describe, expect, it } from "vitest";
import {
  DEMOGRAPHIC_ONBOARDING_ENABLED,
  isDemographicsComplete,
  isDemographicsGrandfathered,
  isDemographicsRequired,
  shouldStartOnboardingAtEmailVerification,
} from "@/lib/onboarding/demographicOnboardingPolicy";
import { resolveAppShellRoute, resolveProfileRoute } from "@/lib/client/appShellRoute";
import {
  decideOnboardingQaReplay,
  markCharacterQaReplayCompleted,
  markDemographicQaReplayCompleted,
} from "@/lib/client/onboardingQaSession";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";

describe("demographic onboarding policy", () => {
  it("is enabled", () => {
    expect(DEMOGRAPHIC_ONBOARDING_ENABLED).toBe(true);
  });

  it("requires student_status, institution, and at least 3 interests", () => {
    expect(
      isDemographicsComplete({
        profile: { student_status: "current_or_incoming", institution_id: "uri" },
        preferences: { interests: ["athletics", "music"] },
      }),
    ).toBe(false);

    expect(
      isDemographicsComplete({
        profile: { student_status: "current_or_incoming", institution_id: "uri", class_year: null },
        preferences: { interests: ["athletics", "music", "tech"], communities: [] },
      }),
    ).toBe(true);

    expect(
      isDemographicsComplete({
        profile: { student_status: "current_student", institution_id: "uri" },
        preferences: { interests: ["athletics", "music", "tech"], communities: [] },
      }),
    ).toBe(true);

    expect(
      isDemographicsComplete({
        profile: { student_status: "faculty_staff", institution_id: "uri", class_year: null },
        preferences: { interests: ["career", "academics", "clubs"], communities: [] },
      }),
    ).toBe(true);
  });

  it("allows empty communities as complete", () => {
    expect(
      isDemographicsComplete({
        profile: { student_status: "not_student", institution_id: "uri" },
        preferences: { interests: ["career", "tech", "clubs"], communities: [] },
      }),
    ).toBe(true);
  });

  it("grandfathers pre-v2 users who already finished character setup", () => {
    const profile = {
      onboarding_character_completed: true,
      onboarding_completed: true,
      onboarding_version: null,
      student_status: null,
      institution_id: null,
    };
    expect(isDemographicsGrandfathered(profile)).toBe(true);
    expect(isDemographicsRequired({ profile, preferences: { interests: [] } })).toBe(false);
  });

  it("requires demographics for brand-new incomplete users", () => {
    expect(
      isDemographicsRequired({
        profile: {
          onboarding_character_completed: false,
          onboarding_completed: false,
          onboarding_version: null,
        },
        preferences: { interests: [] },
      }),
    ).toBe(true);
  });

  it("requires demographics when v2 started but interests are incomplete", () => {
    expect(
      isDemographicsRequired({
        profile: {
          onboarding_character_completed: true,
          onboarding_version: 2,
          student_status: "current_or_incoming",
          institution_id: "uri",
        },
        preferences: { interests: ["athletics"] },
      }),
    ).toBe(true);
  });

  it("QA replay forces demographics even when complete", () => {
    expect(
      isDemographicsRequired({
        profile: {
          onboarding_character_completed: true,
          onboarding_version: 2,
          student_status: "current_or_incoming",
          institution_id: "uri",
        },
        preferences: { interests: ["athletics", "music", "tech"] },
        forceQaReplay: true,
      }),
    ).toBe(true);
  });

  it("does not start at email verification when earlier demographics are incomplete", () => {
    expect(
      shouldStartOnboardingAtEmailVerification({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe(false);
    expect(
      shouldStartOnboardingAtEmailVerification({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          campus_email_verified_at: null,
        },
        preferences: { exists: false, interests: ["athletics"] },
      }),
    ).toBe(false);
  });

  it("starts at email verification only when demographics are complete and email is still required", () => {
    expect(
      shouldStartOnboardingAtEmailVerification({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          campus_email_verified_at: null,
          onboarding_character_completed: false,
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"] },
      }),
    ).toBe(true);
  });

  it("QA replay never starts ordinary onboarding at the OTP screen", () => {
    expect(
      shouldStartOnboardingAtEmailVerification({
        profile: {
          student_status: "current_student",
          institution_id: "uri",
          campus_email_verified_at: null,
        },
        preferences: { interests: ["athletics", "music", "tech"] },
        forceQaReplay: true,
      }),
    ).toBe(false);
  });
});

describe("authenticated route order", () => {
  it("new signup path: display name → demographics → CharacterGate → app", () => {
    const incomplete = {
      onboarding_completed: false,
      onboarding_character_completed: false,
      role: null as string | null,
    };
    expect(
      resolveProfileRoute(incomplete, {
        preferences: { interests: [] },
      }),
    ).toBe("display_name_gate");

    expect(
      resolveProfileRoute(
        {
          ...incomplete,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: [] } },
      ),
    ).toBe("demographics_gate");

    expect(
      resolveProfileRoute(
        {
          ...incomplete,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          campus_email_verified_at: "2026-08-25T00:00:00.000Z",
        },
        {
          preferences: { interests: ["athletics", "music", "tech"], communities: [] },
        },
      ),
    ).toBe("character_gate");

    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          onboarding_completed: true,
          role: "student",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
        },
        {
          preferences: { interests: ["athletics", "music", "tech"] },
        },
      ),
    ).toBe("app");
  });

  it("cannot skip demographics when incomplete", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "demographics_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("demographics");
  });

  it("existing completed grandfathered user goes to app", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          onboarding_completed: true,
          role: "student",
          onboarding_version: null,
        },
        { preferences: { interests: [] } },
      ),
    ).toBe("app");
  });

  it("demographics complete + character incomplete → CharacterGate", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: false,
          onboarding_completed: false,
          role: null,
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a", "b", "c"], communities: [] } },
      ),
    ).toBe("character_gate");
  });

  it("signup and sign-in use the same demographics gate for incomplete users", () => {
    const incompleteAfterDisplayName = {
      onboarding_completed: false,
      onboarding_character_completed: false,
      role: null as string | null,
      display_name_changed_at: "2026-08-25T00:00:00.000Z",
      campus_email_verified_at: null as string | null,
    };
    const prefs = { preferences: { exists: false, interests: [] as string[] } };
    expect(resolveProfileRoute(incompleteAfterDisplayName, prefs)).toBe("demographics_gate");
    expect(resolveProfileRoute({ ...incompleteAfterDisplayName }, prefs)).toBe("demographics_gate");
  });

  it("fully onboarded users skip onboarding on a later sign-in", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          onboarding_completed: true,
          role: "student",
          student_status: "current_student",
          institution_id: "uri",
          onboarding_version: 2,
          campus_email_verified_at: "2026-08-25T00:00:00.000Z",
        },
        { preferences: { interests: ["athletics", "music", "tech"] } },
      ),
    ).toBe("app");
  });

  it("does not mass-force grandfathered existing users without demographics fields", () => {
    const existing = {
      onboarding_completed: true,
      onboarding_character_completed: true,
      role: "student",
      onboarding_version: null as number | null,
      student_status: null as string | null,
      institution_id: null as string | null,
    };
    expect(isDemographicsGrandfathered(existing)).toBe(true);
    expect(
      resolveProfileRoute(existing, { preferences: { interests: [], communities: [] } }),
    ).toBe("app");
  });

  it("does not send completed users back through onboarding after the screen order change", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          onboarding_completed: true,
          role: "student",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
        },
        { preferences: { interests: ["athletics", "music", "tech"] } },
      ),
    ).toBe("app");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        showPostLoginLoading: false,
        hasCharacter: true,
      }),
    ).toBe("app");
  });

  it("routes campus email verification after demographics are complete, then avatar — without a loop", () => {
    const personalizationDone = {
      onboarding_character_completed: false,
      onboarding_completed: false,
      role: null as string | null,
      student_status: "incoming_student",
      institution_id: "uri",
      onboarding_version: 2,
      display_name_changed_at: "2026-01-01T00:00:00.000Z",
    };
    const prefs = { preferences: { interests: ["athletics", "music", "tech"], communities: [] } };

    expect(
      resolveProfileRoute(
        { ...personalizationDone, campus_email_verified_at: null },
        prefs,
      ),
    ).toBe("demographics_gate");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "demographics_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("demographics");

    expect(
      resolveProfileRoute(
        { ...personalizationDone, campus_email_verified_at: "2026-08-24T00:00:00.000Z" },
        prefs,
      ),
    ).toBe("character_gate");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "character_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("onboarding");
  });

  it("incomplete existing user without character completion is gated to demographics after display name", () => {
    expect(
      resolveProfileRoute(
        {
          onboarding_completed: false,
          onboarding_character_completed: false,
          role: "student",
          onboarding_version: null,
          display_name_changed_at: "2026-01-01T00:00:00.000Z",
        },
        { preferences: { interests: ["a"], communities: [] } },
      ),
    ).toBe("demographics_gate");
  });

  it("sign-in path can resolve to demographics (not signup-only)", () => {
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: resolveProfileRoute(
          {
            onboarding_character_completed: false,
            role: null,
            display_name_changed_at: "2026-01-01T00:00:00.000Z",
          },
          { preferences: { interests: [] } },
        ),
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("demographics");
  });
});

describe("QA demographic vs character replay", () => {
  it("forces demographics then character on a new QA session", () => {
    const decision = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "u1",
      sessionId: "s1",
      stored: null,
    });
    expect(decision.demographicsReplay).toBe(true);
    expect(decision.replay).toBe(true);

    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          onboarding_completed: true,
          role: "admin",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
        },
        {
          preferences: { interests: ["athletics", "music", "tech"] },
          forceDemographicsQaReplay: decision.demographicsReplay,
          forceCharacterQaReplay: decision.replay,
        },
      ),
    ).toBe("demographics_gate");

    const afterDemos = markDemographicQaReplayCompleted(decision.record);
    const mid = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "u1",
      sessionId: "s1",
      stored: afterDemos,
    });
    expect(mid.demographicsReplay).toBe(false);
    expect(mid.replay).toBe(true);
    expect(
      resolveProfileRoute(
        {
          onboarding_character_completed: true,
          role: "admin",
          student_status: "current_or_incoming",
          institution_id: "uri",
          onboarding_version: 2,
        },
        {
          preferences: { interests: ["athletics", "music", "tech"] },
          forceDemographicsQaReplay: mid.demographicsReplay,
          forceCharacterQaReplay: mid.replay,
        },
      ),
    ).toBe("character_gate");

    const afterChar = markCharacterQaReplayCompleted(mid.record);
    const done = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "u1",
      sessionId: "s1",
      stored: afterChar,
    });
    expect(done.demographicsReplay).toBe(false);
    expect(done.replay).toBe(false);
  });

  it("QA replay uses session flags only and does not imply profile/stats row recreation", () => {
    const profile = {
      onboarding_completed: true,
      onboarding_character_completed: true,
      role: "admin" as const,
      student_status: "current_or_incoming",
      institution_id: "uri",
      onboarding_version: 2,
    };
    const decision = decideOnboardingQaReplay({
      email: ONBOARDING_QA_EMAIL,
      userId: "admin-1",
      sessionId: "s-new",
      stored: null,
    });
    expect(decision.demographicsReplay).toBe(true);
    // Original profile completion flags remain true — overlay is force* flags only.
    expect(profile.onboarding_completed).toBe(true);
    expect(profile.onboarding_character_completed).toBe(true);
    expect(
      resolveProfileRoute(profile, {
        preferences: { interests: ["athletics", "music", "tech"] },
        forceDemographicsQaReplay: true,
        forceCharacterQaReplay: true,
      }),
    ).toBe("demographics_gate");
  });
});
