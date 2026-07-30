import { describe, expect, it } from "vitest";
import {
  isInternalAccount,
  isKnownQaAccountEmail,
  isPermanentQaEmail,
  PERMANENT_QA_SIGNUP_EMAIL,
  QA_ACCOUNT_PROFILE_FLAGS,
  resolveQaTestAccountEmail,
} from "@/lib/internalAccount";
import { canAccessCampusFeatures } from "@/lib/campusAccess";
import { isLeaderboardEligible } from "@/lib/leaderboardEligibility";

describe("isPermanentQaEmail", () => {
  it("matches the permanent QA email case-insensitively", () => {
    expect(isPermanentQaEmail("qa_signup@campusquestapp.com")).toBe(true);
    expect(isPermanentQaEmail("QA_Signup@CampusQuestApp.com")).toBe(true);
    expect(isPermanentQaEmail(`  ${PERMANENT_QA_SIGNUP_EMAIL}  `)).toBe(true);
  });

  it("does not match other campusquestapp.com addresses", () => {
    expect(isPermanentQaEmail("random@campusquestapp.com")).toBe(false);
    expect(isPermanentQaEmail("campusquest@campusquestapp.com")).toBe(false);
    expect(isPermanentQaEmail("qa_signup@campusquest.app")).toBe(false);
  });
});

describe("isInternalAccount", () => {
  it("allows the permanent QA email to access campus features without @uri.edu", () => {
    expect(
      isInternalAccount({ email: "qa_signup@campusquestapp.com" }, null),
    ).toBe(true);

    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: isInternalAccount({ email: "qa_signup@campusquestapp.com" }, null),
        email: "qa_signup@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(true);
  });

  it("blocks a random @campusquestapp.com email from campus access", () => {
    expect(isInternalAccount({ email: "random@campusquestapp.com" }, null)).toBe(false);
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: isInternalAccount({ email: "random@campusquestapp.com" }, null),
        email: "random@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(false);
  });

  it("allows a verified @uri.edu student", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: false,
        email: "student@uri.edu",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: {
          status: "verified",
          schoolName: "University of Rhode Island",
          schoolDomain: "uri.edu",
        },
      }),
    ).toBe(true);
  });

  it("never treats the QA account as leaderboard-eligible once flagged", () => {
    const qaProfile = {
      role: "qa",
      is_test_user: true,
      is_hidden: true,
      is_internal_tester: true,
    };
    expect(isInternalAccount({ email: PERMANENT_QA_SIGNUP_EMAIL }, qaProfile)).toBe(true);
    expect(isLeaderboardEligible(qaProfile)).toBe(false);
    expect(
      isLeaderboardEligible({
        role: "student",
        is_test_user: true,
        is_hidden: true,
      }),
    ).toBe(false);
  });

  it("excludes QA from public rankings/analytics eligibility via the same flags", () => {
    // listHiddenUserIds / pilot analytics / directories filter on these flags.
    const qaFlags = QA_ACCOUNT_PROFILE_FLAGS;
    expect(qaFlags.is_test_user).toBe(true);
    expect(qaFlags.is_hidden).toBe(true);
    expect(qaFlags.role).toBe("qa");
    expect(isLeaderboardEligible(qaFlags)).toBe(false);
  });

  it("recognizes profile flags even without the QA email", () => {
    expect(
      isInternalAccount({ email: "someone@example.com" }, { is_test_user: true }),
    ).toBe(true);
    expect(
      isInternalAccount({ email: "someone@example.com" }, { role: "qa" }),
    ).toBe(true);
    expect(
      isInternalAccount({ email: "someone@example.com" }, { is_internal_tester: true }),
    ).toBe(true);
  });

  it("keeps known legacy QA emails as internal for reset/protection", () => {
    expect(isKnownQaAccountEmail("qa-signup@campusquest.app")).toBe(true);
    expect(isKnownQaAccountEmail("qa@campusquest.app")).toBe(true);
    expect(isInternalAccount({ email: "qa-signup@campusquest.app" }, null)).toBe(true);
  });
});

describe("resolveQaTestAccountEmail", () => {
  it("defaults to the permanent QA signup address", () => {
    expect(resolveQaTestAccountEmail()).toBe(PERMANENT_QA_SIGNUP_EMAIL);
  });
});
