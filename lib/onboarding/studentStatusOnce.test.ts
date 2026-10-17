/**
 * Campus status must be asked exactly once. About You is the canonical owner.
 * RoleSelectionGate is a leftover second question unless studentStatus is missing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProfileRoute } from "@/lib/client/appShellRoute";
import { isLeaderboardEligible } from "@/lib/leaderboardEligibility";
import { isDemographicsComplete } from "@/lib/onboarding/demographicOnboardingPolicy";
import { resolveDemographicResumeStep } from "@/lib/onboarding/flow";
import {
  isAboutYouReady,
  personalizeContinueBlockReason,
  stepAfterCampusVerification,
} from "@/lib/onboarding/personalizeStep";
import {
  isFreshStudentStatusQuestion,
  persistStudentStatusPatch,
  selectableRoleFromStudentStatus,
  STUDENT_STATUS_COLLECTION_STEP,
} from "@/lib/onboarding/studentStatusRole";
import { hasValidRoleSelection } from "@/lib/roles";

const FLOW_SRC = readFileSync(join(process.cwd(), "components/auth/AuthOnboardingFlow.tsx"), "utf8");
const ROLE_GATE_SRC = readFileSync(join(process.cwd(), "components/RoleSelectionGate.tsx"), "utf8");

function countStatusAsks(walk: Array<{ step: string; studentStatus?: string | null }>): number {
  return walk.filter((frame) =>
    isFreshStudentStatusQuestion({ step: frame.step, studentStatus: frame.studentStatus }),
  ).length;
}

describe("canonical studentStatus owner", () => {
  it("maps About You answers onto the existing role column — no second field", () => {
    expect(STUDENT_STATUS_COLLECTION_STEP).toBe("about_you");
    expect(selectableRoleFromStudentStatus("current_student")).toBe("student");
    expect(selectableRoleFromStudentStatus("incoming_student")).toBe("student");
    expect(selectableRoleFromStudentStatus("graduate_student")).toBe("student");
    expect(selectableRoleFromStudentStatus("current_or_incoming")).toBe("student");
    expect(selectableRoleFromStudentStatus("faculty_staff")).toBe("faculty_staff");
    expect(selectableRoleFromStudentStatus("not_student")).toBe("faculty_staff");
    expect(selectableRoleFromStudentStatus(null)).toBeNull();
    expect(persistStudentStatusPatch("current_student")).toEqual({ studentStatus: "current_student" });
  });

  it("About You is the only onboarding collector; Personalize never asks", () => {
    expect(FLOW_SRC).toContain("STUDENT_STATUS_OPTIONS");
    expect(FLOW_SRC).toMatch(/setStudentStatus\(opt\.id\)[\s\S]*persistProfilePatch\(\{\s*studentStatus: opt\.id/);
    const personalizeBlock = FLOW_SRC.slice(FLOW_SRC.indexOf('step === "personalize"'));
    expect(personalizeBlock).not.toContain("STUDENT_STATUS_OPTIONS");
    expect(ROLE_GATE_SRC).toMatch(/canonical collector/i);
  });
});

describe("A. Fresh URI student — status asked once, onboarding finishes", () => {
  it("asks on About You only, then reaches ready without a second prompt", () => {
    const start = resolveDemographicResumeStep({
      profile: { campus_email_verified_at: null },
      preferences: { exists: false, interests: [] },
    });
    expect(start).toBe("about_you");
    expect(isFreshStudentStatusQuestion({ step: start, studentStatus: null })).toBe(true);

    const studentStatus = "current_student" as const;
    const graduationYear = 2028;
    expect(isAboutYouReady({ studentStatus, graduationYear })).toBe(true);
    expect(isFreshStudentStatusQuestion({ step: "about_you", studentStatus })).toBe(false);

    const afterCampus = stepAfterCampusVerification({
      demographicsAlreadyComplete: false,
      studentStatus,
      graduationYear,
      interests: [],
    });
    expect(afterCampus).toBe("personalize");
    expect(isFreshStudentStatusQuestion({ step: afterCampus, studentStatus })).toBe(false);

    expect(
      personalizeContinueBlockReason({ studentStatus, interests: ["athletics", "music", "tech"] }),
    ).toBeNull();

    const ready = resolveDemographicResumeStep({
      profile: {
        student_status: studentStatus,
        institution_id: "uri",
        class_year: graduationYear,
        campus_email_verified_at: "2026-10-17T00:00:00.000Z",
      },
      preferences: { exists: true, interests: ["athletics", "music", "tech"], institutionId: "uri" },
    });
    expect(ready).toBe("ready");

    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        onboarding_character_completed: true,
        role: selectableRoleFromStudentStatus(studentStatus),
        student_status: studentStatus,
        campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        display_name_changed_at: "2026-10-17T00:00:00.000Z",
      }),
    ).toBe("app");

    expect(
      countStatusAsks([
        { step: start, studentStatus: null },
        { step: "about_you", studentStatus },
        { step: afterCampus, studentStatus },
        { step: ready, studentStatus },
        { step: "role_gate", studentStatus },
      ]),
    ).toBe(1);
  });
});

describe("B. Email-first URI student — verify → About You once → interests → app", () => {
  it("keeps email-first order and asks status only on About You", () => {
    expect(
      resolveDemographicResumeStep({
        profile: { campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
        startAtEmailVerification: true,
      }),
    ).toBe("campus");

    const afterVerify = stepAfterCampusVerification({
      demographicsAlreadyComplete: false,
      studentStatus: null,
      graduationYear: null,
      interests: [],
    });
    expect(afterVerify).toBe("about_you");
    expect(isFreshStudentStatusQuestion({ step: afterVerify, studentStatus: null })).toBe(true);

    const studentStatus = "incoming_student" as const;
    expect(
      stepAfterCampusVerification({
        demographicsAlreadyComplete: false,
        studentStatus,
        graduationYear: 2029,
        interests: [],
      }),
    ).toBe("personalize");

    expect(
      isDemographicsComplete({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"], institutionId: "uri" },
      }),
    ).toBe(true);

    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          class_year: 2029,
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"], institutionId: "uri" },
        startAtEmailVerification: true,
      }),
    ).toBe("ready");

    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "student",
        student_status: studentStatus,
        campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        display_name_changed_at: "2026-10-17T00:00:00.000Z",
      }),
    ).toBe("app");

    expect(
      countStatusAsks([
        { step: "campus", studentStatus: null },
        { step: "about_you", studentStatus: null },
        { step: "about_you", studentStatus },
        { step: "personalize", studentStatus },
        { step: "ready", studentStatus },
      ]),
    ).toBe(1);
  });
});

describe("C. Existing studentStatus — resume reuses it, no duplicate question", () => {
  it("skips About You when status + year + email + interests are already saved", () => {
    const studentStatus = "graduate_student";
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          class_year: 2027,
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests: ["athletics", "music", "tech"], institutionId: "uri" },
      }),
    ).toBe("ready");
    expect(isFreshStudentStatusQuestion({ step: "ready", studentStatus })).toBe(false);
    expect(hasValidRoleSelection({ role: null, student_status: studentStatus })).toBe(true);
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: null,
        student_status: studentStatus,
        campus_email_verified_at: "2026-10-17T00:00:00.000Z",
      }),
    ).not.toBe("role_gate");
  });

  it("may reopen About You for a missing grad year but keeps status selected", () => {
    const studentStatus = "current_student";
    expect(
      resolveDemographicResumeStep({
        profile: { student_status: studentStatus, campus_email_verified_at: null },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe("about_you");
    expect(isFreshStudentStatusQuestion({ step: "about_you", studentStatus })).toBe(false);
    expect(isAboutYouReady({ studentStatus, graduationYear: null })).toBe(false);
  });
});

describe("D. Refresh after answering status — value stays, not asked again", () => {
  it("reloads from persisted profile/draft and does not treat status as unanswered", () => {
    const persisted = persistStudentStatusPatch("current_student");
    const studentStatus = persisted.studentStatus;
    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: studentStatus,
          class_year: 2028,
          campus_email_verified_at: null,
        },
        draft: { studentStatus, graduationYear: 2028 },
        preferences: { exists: false, interests: [] },
      }),
    ).toBe("campus");
    expect(isFreshStudentStatusQuestion({ step: "campus", studentStatus })).toBe(false);
    expect(isFreshStudentStatusQuestion({ step: "about_you", studentStatus })).toBe(false);
    expect(hasValidRoleSelection({ role: null, student_status: studentStatus })).toBe(true);
  });
});

describe("E. Faculty/staff — role persists, not asked twice, leaderboard exclusion unchanged", () => {
  it("derives faculty_staff, skips the second prompt, and stays off leaderboards", () => {
    const studentStatus = "faculty_staff";
    expect(selectableRoleFromStudentStatus(studentStatus)).toBe("faculty_staff");
    expect(isAboutYouReady({ studentStatus, graduationYear: null })).toBe(true);
    expect(isFreshStudentStatusQuestion({ step: "about_you", studentStatus })).toBe(false);

    expect(
      resolveDemographicResumeStep({
        profile: {
          student_status: studentStatus,
          institution_id: "uri",
          campus_email_verified_at: "2026-10-17T00:00:00.000Z",
        },
        preferences: { exists: true, interests: ["career", "tech", "clubs"], institutionId: "uri" },
      }),
    ).toBe("ready");

    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: null,
        student_status: studentStatus,
        campus_email_verified_at: "2026-10-17T00:00:00.000Z",
      }),
    ).not.toBe("role_gate");

    expect(hasValidRoleSelection({ role: "faculty_staff", student_status: studentStatus })).toBe(true);
    expect(isLeaderboardEligible({ role: "faculty_staff", is_hidden: false, is_test_user: false })).toBe(
      false,
    );
    expect(isLeaderboardEligible({ role: "student", is_hidden: false, is_test_user: false })).toBe(true);
  });
});
