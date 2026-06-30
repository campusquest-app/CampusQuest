import { describe, expect, it } from "vitest";
import { isPlatformAdmin } from "@/lib/server/permissions";

describe("isPlatformAdmin", () => {
  const confirmed = {
    email_confirmed_at: "2026-01-01T00:00:00Z",
  };

  it("allows admin role regardless of email domain", () => {
    expect(
      isPlatformAdmin(
        { email: "campusquest@campusquestapp.com", ...confirmed } as any,
        "admin",
      ),
    ).toBe(true);
  });

  it("allows dev fallback emails when confirmed", () => {
    expect(
      isPlatformAdmin(
        { email: "nicklockhart22@gmail.com", ...confirmed } as any,
        "student",
      ),
    ).toBe(true);
    expect(
      isPlatformAdmin(
        { email: "campusquest@campusquestapp.com", ...confirmed } as any,
        "student",
      ),
    ).toBe(true);
  });

  it("blocks non-admin domains without role", () => {
    expect(
      isPlatformAdmin(
        { email: "student@gmail.com", ...confirmed } as any,
        "student",
      ),
    ).toBe(false);
  });

  it("blocks fallback emails when email is not confirmed", () => {
    expect(
      isPlatformAdmin({ email: "nicklockhart22@gmail.com" } as any, "student"),
    ).toBe(false);
  });
});
