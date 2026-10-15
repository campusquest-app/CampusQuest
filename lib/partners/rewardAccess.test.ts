import { describe, expect, it } from "vitest";
import {
  evaluateStudentRewardEligibility,
  REWARD_ERROR_CODES,
  REWARD_ISSUE_COPY,
  rewardIssueFromError,
  rewardPassSecondsLeft,
  sanitizeRewardPassIssueMessage,
  type StudentRewardEligibilityInput,
  type StudentRewardPass,
} from "@/lib/partners/rewardAccess";
import { estimateServerNowMs } from "@/lib/client/useRewardPass";

const NOW = new Date("2026-10-12T17:00:00Z");

const verifiedStudent: StudentRewardEligibilityInput = {
  role: "student",
  studentStatus: "current_student",
  campusEmailVerifiedAt: "2026-09-01T12:00:00Z",
  email: "student@uri.edu",
  pilotDomain: "uri.edu",
  activeIdentityType: null,
  accountStatus: null,
  suspendedUntil: null,
  now: NOW,
};

function check(overrides: Partial<StudentRewardEligibilityInput>) {
  return evaluateStudentRewardEligibility({ ...verifiedStudent, ...overrides });
}

function codeOf(result: ReturnType<typeof check>) {
  return result.eligible ? null : result.code;
}

describe("evaluateStudentRewardEligibility", () => {
  it("allows a verified URI student on their personal profile", () => {
    expect(check({})).toEqual({ eligible: true });
    expect(check({ activeIdentityType: "personal" })).toEqual({ eligible: true });
    expect(check({ studentStatus: null })).toEqual({ eligible: true });
  });

  it("requires campus email verification on the pilot domain", () => {
    expect(codeOf(check({ campusEmailVerifiedAt: null }))).toBe(REWARD_ERROR_CODES.verificationRequired);
    expect(codeOf(check({ email: "someone@gmail.com" }))).toBe(REWARD_ERROR_CODES.verificationRequired);
    expect(codeOf(check({ email: null }))).toBe(REWARD_ERROR_CODES.verificationRequired);
  });

  it("denies faculty/staff and every non-student role, including unset roles", () => {
    for (const role of ["faculty_staff", "admin", "super_admin", "qa", "beta_internal", null, "STUDENT", ""]) {
      expect(codeOf(check({ role }))).toBe(REWARD_ERROR_CODES.ineligible);
    }
  });

  it("denies a student-role account whose onboarding says faculty/staff or not a student", () => {
    expect(codeOf(check({ studentStatus: "faculty_staff" }))).toBe(REWARD_ERROR_CODES.ineligible);
    expect(codeOf(check({ studentStatus: "not_student" }))).toBe(REWARD_ERROR_CODES.ineligible);
  });

  it("denies business and organization profiles", () => {
    expect(codeOf(check({ activeIdentityType: "business" }))).toBe(REWARD_ERROR_CODES.businessProfile);
    expect(codeOf(check({ activeIdentityType: "organization" }))).toBe(REWARD_ERROR_CODES.businessProfile);
  });

  it("denies banned and actively suspended accounts", () => {
    expect(codeOf(check({ accountStatus: "banned" }))).toBe(REWARD_ERROR_CODES.restricted);
    expect(codeOf(check({ accountStatus: "suspended", suspendedUntil: "2026-12-01T00:00:00Z" }))).toBe(
      REWARD_ERROR_CODES.restricted,
    );
    expect(codeOf(check({ accountStatus: "suspended", suspendedUntil: null }))).toBe(REWARD_ERROR_CODES.restricted);
    expect(check({ accountStatus: "suspended", suspendedUntil: "2026-10-01T00:00:00Z" })).toEqual({ eligible: true });
  });

  it("checks restriction and role before verification so faculty never see a verify prompt", () => {
    expect(codeOf(check({ role: "faculty_staff", campusEmailVerifiedAt: null }))).toBe(REWARD_ERROR_CODES.ineligible);
  });
});

describe("rewardIssueFromError", () => {
  it("maps API failures to student-facing reward states", () => {
    expect(rewardIssueFromError({ status: 401, code: "UNAUTHORIZED" })).toBe("login_required");
    expect(rewardIssueFromError({ status: 403, code: REWARD_ERROR_CODES.verificationRequired })).toBe(
      "verification_required",
    );
    expect(rewardIssueFromError({ status: 403, code: REWARD_ERROR_CODES.ineligible })).toBe("ineligible");
    expect(rewardIssueFromError({ status: 403, code: REWARD_ERROR_CODES.businessProfile })).toBe("ineligible");
    expect(rewardIssueFromError({ status: 409, code: REWARD_ERROR_CODES.comingSoon })).toBe("coming_soon");
    expect(rewardIssueFromError({ status: 410, code: REWARD_ERROR_CODES.expired })).toBe("expired");
    expect(rewardIssueFromError({ status: 409, code: REWARD_ERROR_CODES.unavailable })).toBe("unavailable");
    expect(rewardIssueFromError({ status: 500, code: "REWARD_VERIFICATION_FAILED" })).toBe("error");
    expect(rewardIssueFromError({ status: 0 })).toBe("offline");
  });

  it("has copy for every state and never calls the pass proof of purchase", () => {
    for (const copy of Object.values(REWARD_ISSUE_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(`${copy.title} ${copy.body}`).not.toMatch(/redeemed|purchase confirmed|cryptographic/i);
    }
  });
});

describe("sanitizeRewardPassIssueMessage", () => {
  it("drops localhost backend diagnostics and keeps the user-facing sentence", () => {
    expect(
      sanitizeRewardPassIssueMessage(
        "ineligible",
        "Backend request failed: /api/partners/daisys-chicken-ice-cream/reward-pass returned 403 Forbidden. Student rewards are only for verified URI student accounts.",
      ),
    ).toBe("Student rewards are only for verified URI student accounts.");
  });

  it("falls back to canned copy when the message is only a diagnostic", () => {
    expect(
      sanitizeRewardPassIssueMessage("error", "Backend request failed: /api/partners/x/reward-pass returned 500 Internal Server Error."),
    ).toBe(REWARD_ISSUE_COPY.error.body);
  });

  it("keeps a specific, clean server denial", () => {
    expect(
      sanitizeRewardPassIssueMessage("ineligible", "Switch to your personal student profile to use student rewards."),
    ).toBe("Switch to your personal student profile to use student rewards.");
  });
});

describe("rewardPassSecondsLeft", () => {
  const pass = { expiresAt: "2026-10-12T17:01:00.000Z" } as StudentRewardPass;

  it("counts down on the server clock", () => {
    expect(rewardPassSecondsLeft(pass, 0, Date.parse("2026-10-12T17:00:00Z"))).toBe(60);
    expect(rewardPassSecondsLeft(pass, 0, Date.parse("2026-10-12T17:00:45.500Z"))).toBe(15);
  });

  it("ignores a wrong device clock by applying the server offset", () => {
    const deviceAhead = Date.parse("2026-10-12T17:10:00Z");
    expect(rewardPassSecondsLeft(pass, -10 * 60_000, deviceAhead)).toBe(60);
  });

  it("is zero once expired or when the expiry is unreadable", () => {
    expect(rewardPassSecondsLeft(pass, 0, Date.parse("2026-10-12T17:01:00Z"))).toBe(0);
    expect(rewardPassSecondsLeft({ expiresAt: "nope" } as StudentRewardPass, 0, 0)).toBe(0);
  });
});

describe("estimateServerNowMs", () => {
  const serverMs = Date.parse("2026-10-12T17:00:00Z");
  const anchor = { serverMs, wallMs: 1_000_000, monoMs: 5_000 };
  const pass = { expiresAt: "2026-10-12T17:01:00.000Z" } as StudentRewardPass;

  it("advances with elapsed device time", () => {
    expect(estimateServerNowMs(anchor, 1_030_000, 35_000)).toBe(serverMs + 30_000);
  });

  it("cannot be stretched by moving the device clock backwards", () => {
    const now = estimateServerNowMs(anchor, 1_000_000 - 3_600_000, 75_000);
    expect(now).toBe(serverMs + 70_000);
    expect(rewardPassSecondsLeft(pass, 0, now)).toBe(0);
  });

  it("still expires after device sleep pauses the monotonic clock", () => {
    const now = estimateServerNowMs(anchor, 1_000_000 + 10 * 60_000, 6_000);
    expect(rewardPassSecondsLeft(pass, 0, now)).toBe(0);
  });
});
