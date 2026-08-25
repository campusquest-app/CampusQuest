import { describe, expect, it, vi } from "vitest";
import {
  CAMPUS_EMAIL_MAX_ATTEMPTS,
  CAMPUS_EMAIL_USER_MESSAGES,
  isAllowedCampusVerificationEmail,
  isCampusEmailVerificationRequired,
  isCampusEmailVerified,
  isValidCampusEmailCode,
  maskCampusEmail,
} from "@/lib/campusEmailVerification";
import {
  generateCampusEmailCode,
  hashCampusEmailCode,
  campusEmailCodesMatch,
  getEmailVerificationSecret,
} from "@/lib/server/campusEmailVerificationCrypto";
import {
  sendCampusEmailVerification,
  verifyCampusEmailCode,
  type CampusEmailChallengeRow,
  type CampusEmailStore,
} from "@/lib/server/campusEmailVerification";
import { ApiError } from "@/lib/server/http";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import { FORBIDDEN_PROFILE_MUTATION_FIELDS } from "@/lib/server/profileSecurity";
import { resolveProfileRoute } from "@/lib/client/appShellRoute";
import { getBearerToken } from "@/lib/server/supabase";

const SECRET = "test-email-verification-secret";

function createMemoryStore(initialVerifiedAt: string | null = null): CampusEmailStore & {
  verifiedAt: string | null;
  rows: CampusEmailChallengeRow[];
  profileTouches: { userId: string; at: string | null }[];
} {
  const store = {
    verifiedAt: initialVerifiedAt,
    rows: [] as CampusEmailChallengeRow[],
    profileTouches: [] as { userId: string; at: string | null }[],
    async getProfileVerifiedAt() {
      return store.verifiedAt;
    },
    async setProfileVerifiedAt(userId: string, at: string | null) {
      store.verifiedAt = at;
      store.profileTouches.push({ userId, at });
    },
    async listChallenges(userId: string) {
      return [...store.rows]
        .filter((row) => row.user_id === userId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    async insertChallenge(row: Omit<CampusEmailChallengeRow, "id"> & { id?: string }) {
      const created: CampusEmailChallengeRow = {
        ...row,
        id: row.id ?? `ch-${store.rows.length + 1}`,
      };
      store.rows.unshift(created);
      return created;
    },
    async invalidateOpenChallenges(_userId: string, at: string) {
      store.rows = store.rows.map((row) =>
        row.user_id === _userId && !row.consumed_at && !row.invalidated_at
          ? { ...row, invalidated_at: at }
          : row,
      );
    },
    async markDispatched(id: string, at: string) {
      store.rows = store.rows.map((row) => (row.id === id ? { ...row, dispatched_at: at } : row));
    },
    async consumeIfHashMatches(args: { id: string; userId: string; codeHash: string; at: string }) {
      const row = store.rows.find((item) => item.id === args.id);
      if (!row || row.user_id !== args.userId || row.consumed_at || row.invalidated_at) return false;
      if (row.code_hash !== args.codeHash) return false;
      row.consumed_at = args.at;
      return true;
    },
    async incrementAttempts(id: string) {
      const row = store.rows.find((item) => item.id === id);
      if (!row) return 0;
      row.attempts += 1;
      return row.attempts;
    },
  };
  return store;
}

describe("campus email presentation + policy", () => {
  it("masks local part and keeps the domain", () => {
    expect(maskCampusEmail("nicklockhart22@uri.edu")).toBe(`n${"•".repeat("nicklockhart22".length - 1)}@uri.edu`);
  });

  it("allows URI and approved QA signup emails, not arbitrary inboxes", () => {
    expect(isAllowedCampusVerificationEmail("student@uri.edu")).toBe(true);
    expect(isAllowedCampusVerificationEmail(ONBOARDING_QA_EMAIL)).toBe(true);
    expect(isAllowedCampusVerificationEmail("stranger@gmail.com")).toBe(false);
  });

  it("treats omitted campus_email_verified_at as not locking existing payloads", () => {
    expect(isCampusEmailVerificationRequired({})).toBe(false);
    expect(isCampusEmailVerificationRequired({ campus_email_verified_at: null })).toBe(true);
    expect(isCampusEmailVerified({ campus_email_verified_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});

describe("code generation and hashing", () => {
  it("always generates independent 6-digit numeric codes", () => {
    const codes = Array.from({ length: 8 }, () => generateCampusEmailCode());
    const unique = new Set(codes);
    for (const code of codes) {
      expect(isValidCampusEmailCode(code)).toBe(true);
    }
    expect(unique.size).toBeGreaterThan(1);
  });

  it("keeps codes in the crypto 6-digit range", () => {
    for (let i = 0; i < 40; i += 1) {
      const n = Number(generateCampusEmailCode());
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThan(1000000);
    }
  });

  it("hashes deterministically and does not store plaintext", () => {
    const hash = hashCampusEmailCode({
      userId: "user-1",
      email: "student@uri.edu",
      code: "482913",
      secret: SECRET,
    });
    expect(hash).not.toContain("482913");
    expect(
      campusEmailCodesMatch(
        hash,
        hashCampusEmailCode({
          userId: "user-1",
          email: "student@uri.edu",
          code: "482913",
          secret: SECRET,
        }),
      ),
    ).toBe(true);
    expect(
      campusEmailCodesMatch(
        hash,
        hashCampusEmailCode({
          userId: "user-1",
          email: "student@uri.edu",
          code: "000000",
          secret: SECRET,
        }),
      ),
    ).toBe(false);
  });

  it("fails loudly when the verification secret is missing", () => {
    expect(() => getEmailVerificationSecret({})).toThrow(/not configured/i);
  });
});

describe("send + verify", () => {
  it("sends a hashed challenge and verifies the correct code", async () => {
    const store = createMemoryStore();
    const mailer = vi.fn(async (_mail: { to: string; code: string }) => undefined);
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer,
      secret: SECRET,
      generateCode: () => "482913",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(mailer.mock.calls[0]?.[0]).toEqual({ to: "student@uri.edu", code: "482913" });
    expect(store.rows[0]?.code_hash).not.toContain("482913");
    expect(store.rows[0]?.code_hash).toBe(
      hashCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "482913",
        secret: SECRET,
      }),
    );

    const verified = await verifyCampusEmailCode({
      userId: "user-1",
      email: "student@uri.edu",
      code: "482913",
      store,
      secret: SECRET,
      now: new Date("2026-08-25T12:01:00Z"),
    });
    expect(verified.verified).toBe(true);
    expect(store.verifiedAt).toBeTruthy();
  });

  it("rejects incorrect, expired, consumed, and invalidated codes", async () => {
    const store = createMemoryStore();
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "111111",
      now: new Date("2026-08-25T12:00:00Z"),
    });

    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "222222",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:00:10Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.incorrect });

    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "111111",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:20:00Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.expired });
  });

  it("locks after five incorrect attempts", async () => {
    const store = createMemoryStore();
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "333333",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    for (let i = 0; i < CAMPUS_EMAIL_MAX_ATTEMPTS - 1; i += 1) {
      await expect(
        verifyCampusEmailCode({
          userId: "user-1",
          email: "student@uri.edu",
          code: "000000",
          store,
          secret: SECRET,
          now: new Date("2026-08-25T12:00:01Z"),
        }),
      ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.incorrect });
    }
    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "000000",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:00:02Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts });
    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "333333",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:00:03Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts });
  });

  it("invalidates code A on resend so only code B works", async () => {
    const store = createMemoryStore();
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "482913",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "731204",
      now: new Date("2026-08-25T12:01:01Z"),
    });

    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "482913",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:01:10Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.incorrect });

    const ok = await verifyCampusEmailCode({
      userId: "user-1",
      email: "student@uri.edu",
      code: "731204",
      store,
      secret: SECRET,
      now: new Date("2026-08-25T12:01:11Z"),
    });
    expect(ok.verified).toBe(true);
  });

  it("rejects a consumed code after verification is cleared", async () => {
    const store = createMemoryStore();
    await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "444444",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    await verifyCampusEmailCode({
      userId: "user-1",
      email: "student@uri.edu",
      code: "444444",
      store,
      secret: SECRET,
      now: new Date("2026-08-25T12:00:05Z"),
    });
    store.verifiedAt = null;
    await expect(
      verifyCampusEmailCode({
        userId: "user-1",
        email: "student@uri.edu",
        code: "444444",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:00:06Z"),
      }),
    ).rejects.toMatchObject({ message: CAMPUS_EMAIL_USER_MESSAGES.invalidated });
  });

  it("does not return the plaintext code from send", async () => {
    const store = createMemoryStore();
    const result = await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "482913",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    expect(result).not.toHaveProperty("code");
    expect(JSON.stringify(result)).not.toContain("482913");
  });

  it("does not send again when the user is already campus-verified", async () => {
    const store = createMemoryStore("2026-08-01T00:00:00Z");
    const mailer = vi.fn(async () => undefined);
    const result = await sendCampusEmailVerification({
      userId: "user-1",
      email: "student@uri.edu",
      store,
      mailer,
      secret: SECRET,
      generateCode: () => "999999",
    });
    expect(result.alreadyVerified).toBe(true);
    expect(mailer).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(0);
  });

  it("does not let user B consume user A's challenge", async () => {
    const store = createMemoryStore();
    await sendCampusEmailVerification({
      userId: "user-a",
      email: "a@uri.edu",
      store,
      mailer: async () => undefined,
      secret: SECRET,
      generateCode: () => "555555",
      now: new Date("2026-08-25T12:00:00Z"),
    });
    await expect(
      verifyCampusEmailCode({
        userId: "user-b",
        email: "b@uri.edu",
        code: "555555",
        store,
        secret: SECRET,
        now: new Date("2026-08-25T12:00:05Z"),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(store.verifiedAt).toBeNull();
    expect(store.rows.filter((row) => row.user_id === "user-a")[0]?.consumed_at).toBeNull();
  });

  it("forbids client-direct campus_email_verified_at mutations", () => {
    expect(FORBIDDEN_PROFILE_MUTATION_FIELDS).toContain("campus_email_verified_at");
    expect(FORBIDDEN_PROFILE_MUTATION_FIELDS).toContain("campusEmailVerifiedAt");
  });
});

describe("routing + logout persistence", () => {
  it("keeps completed users in the app when campus verification is set", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "student",
        campus_email_verified_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe("app");
  });

  it("routes explicit unverified users back to the verification onboarding gate", () => {
    expect(
      resolveProfileRoute({
        onboarding_completed: true,
        role: "student",
        campus_email_verified_at: null,
        display_name_changed_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe("demographics_gate");
  });

  it("does not erase verification across a simulated logout/login (timestamp remains)", async () => {
    const store = createMemoryStore("2026-08-25T12:05:00Z");
    expect(await store.getProfileVerifiedAt("user-1")).toBe("2026-08-25T12:05:00Z");
    expect(isCampusEmailVerified({ campus_email_verified_at: store.verifiedAt })).toBe(true);
  });
});

describe("authorization", () => {
  it("rejects send/verify without a bearer token", () => {
    const sendReq = new Request("http://localhost/api/auth/email-verification/send", { method: "POST" });
    const verifyReq = new Request("http://localhost/api/auth/email-verification/verify", { method: "POST" });
    expect(() => getBearerToken(sendReq)).toThrow(/Missing bearer token/i);
    expect(() => getBearerToken(verifyReq)).toThrow(/Missing bearer token/i);
  });
});
