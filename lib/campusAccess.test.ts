import { describe, expect, it } from "vitest";
import {
  canAccessCampusFeatures,
  emailMatchesPilotDomain,
  isEmailVerifiedForCampus,
} from "./campusAccess";

describe("campusAccess", () => {
  it("treats users as email-verified when confirmation is not required", () => {
    expect(isEmailVerifiedForCampus({ email_confirmed_at: "2026-01-01" })).toBe(true);
    expect(isEmailVerifiedForCampus({ confirmed_at: "2026-01-01" })).toBe(true);
    // requireEmailVerification is currently off — unconfirmed users pass.
    expect(isEmailVerifiedForCampus({})).toBe(true);
  });

  it("matches pilot school domain case-insensitively", () => {
    expect(emailMatchesPilotDomain("student@uri.edu", "uri.edu")).toBe(true);
    expect(emailMatchesPilotDomain("Student@URI.EDU", "uri.edu")).toBe(true);
    expect(emailMatchesPilotDomain("admin@campusquestapp.com", "uri.edu")).toBe(false);
  });

  it("always allows platform admins regardless of email domain", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: true,
        email: "campusquest@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(true);

    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: true,
        email: "nicholaslockhart22@gmail.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
      }),
    ).toBe(true);
  });

  it("always allows internal testers regardless of email domain", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: true,
        email: "qa_signup@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(true);

    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: true,
        email: "future-tester@example.com",
        emailVerified: false,
        pilotDomain: "uri.edu",
      }),
    ).toBe(true);
  });

  it("allows the permanent QA email even without isInternalTester flag hydrated", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: false,
        email: "qa_signup@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(true);
  });

  it("does not allow arbitrary campusquestapp.com emails", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: false,
        email: "random@campusquestapp.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: null },
      }),
    ).toBe(false);
  });

  it("does not treat non-testers as internal testers", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        isInternalTester: false,
        email: "other@gmail.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: "gmail.com" },
      }),
    ).toBe(false);
  });

  it("requires verified pilot school for regular students", () => {
    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
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

    expect(
      canAccessCampusFeatures({
        isPlatformAdmin: false,
        email: "other@gmail.com",
        emailVerified: true,
        pilotDomain: "uri.edu",
        verification: { status: "pending", schoolName: null, schoolDomain: "gmail.com" },
      }),
    ).toBe(false);
  });
});
