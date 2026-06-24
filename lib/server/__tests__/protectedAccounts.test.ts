import { describe, expect, it } from "vitest";
import { assertAdminCanDeleteTargetUser, isProtectedAccountEmail } from "../protectedAccounts";

describe("isProtectedAccountEmail", () => {
  it("protects campusquest operator accounts", () => {
    expect(isProtectedAccountEmail("campusquest@campusquestapp.com")).toBe(true);
    expect(isProtectedAccountEmail("nicklockhart22@uri.edu")).toBe(true);
  });

  it("does not protect regular student emails", () => {
    expect(isProtectedAccountEmail("student@uri.edu")).toBe(false);
  });
});

describe("assertAdminCanDeleteTargetUser", () => {
  it("blocks protected emails", () => {
    expect(() =>
      assertAdminCanDeleteTargetUser({
        targetUserId: "00000000-0000-0000-0000-000000000001",
        targetEmail: "nicklockhart22@uri.edu",
        targetRole: "student",
      }),
    ).toThrow(/protected/i);
  });

  it("blocks admin roles", () => {
    expect(() =>
      assertAdminCanDeleteTargetUser({
        targetUserId: "00000000-0000-0000-0000-000000000002",
        targetEmail: "staff@example.com",
        targetRole: "admin",
      }),
    ).toThrow(/admin accounts cannot be deleted/i);
  });

  it("allows regular student accounts", () => {
    expect(() =>
      assertAdminCanDeleteTargetUser({
        targetUserId: "00000000-0000-0000-0000-000000000003",
        targetEmail: "student@uri.edu",
        targetRole: "student",
      }),
    ).not.toThrow();
  });
});
