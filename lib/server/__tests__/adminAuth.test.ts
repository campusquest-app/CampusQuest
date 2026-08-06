import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userHasModerationAdminAccess } from "../adminAuth";

describe("userHasModerationAdminAccess", () => {
  const prev = process.env.MODERATION_ADMIN_EMAILS;

  beforeEach(() => {
    process.env.MODERATION_ADMIN_EMAILS = "campusquest@campusquestapp.com,staff@example.com";
  });

  afterEach(() => {
    process.env.MODERATION_ADMIN_EMAILS = prev;
  });

  it("returns false when email is missing; unconfirmed is allowed while verification is off", () => {
    // requireEmailVerification is currently false — list match is enough.
    expect(
      userHasModerationAdminAccess({
        email: "campusquest@campusquestapp.com",
        email_confirmed_at: null,
        confirmed_at: null,
      }),
    ).toBe(true);

    expect(
      userHasModerationAdminAccess({
        email: null,
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(false);
  });

  it("returns true only for verified emails on the moderator list", () => {
    expect(
      userHasModerationAdminAccess({
        email: "campusquest@campusquestapp.com",
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(true);

    expect(
      userHasModerationAdminAccess({
        email: "student@example.com",
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(false);

    expect(
      userHasModerationAdminAccess({
        email: "staff@example.com",
        email_confirmed_at: null,
        confirmed_at: "2025-01-01",
      }),
    ).toBe(true);
  });

  it("matches trimmed user emails and list entries", () => {
    expect(
      userHasModerationAdminAccess({
        email: "  campusquest@campusquestapp.com  ",
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(true);
  });

  it("matches trimmed entries in MODERATION_ADMIN_EMAILS", () => {
    process.env.MODERATION_ADMIN_EMAILS = "  campusquest@campusquestapp.com  , staff@example.com";
    expect(
      userHasModerationAdminAccess({
        email: "campusquest@campusquestapp.com",
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(true);
  });

  it("matches case-insensitively against configured admin emails", () => {
    expect(
      userHasModerationAdminAccess({
        email: "CampusQuest@CampusQuestAPP.com",
        email_confirmed_at: "2025-01-01",
        confirmed_at: null,
      }),
    ).toBe(true);
  });
});
