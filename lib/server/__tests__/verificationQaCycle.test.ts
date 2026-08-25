import { describe, expect, it, vi } from "vitest";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import { canInvokeVerificationQaCycle } from "@/lib/verificationQaCycle";
import {
  assertVerificationQaCaller,
  startVerificationQaCycle,
} from "@/lib/server/verificationQaCycle";
import type { CampusEmailChallengeRow, CampusEmailStore } from "@/lib/server/campusEmailVerification";
import { hashCampusEmailCode } from "@/lib/server/campusEmailVerificationCrypto";
import { ApiError } from "@/lib/server/http";

const SECRET = "test-email-verification-secret";
const AUTH_USER_ID = "qa-auth-uuid-never-change";

function createMemoryStore(): CampusEmailStore & {
  verifiedAt: string | null;
  rows: CampusEmailChallengeRow[];
} {
  const store = {
    verifiedAt: "2026-01-01T00:00:00Z" as string | null,
    rows: [] as CampusEmailChallengeRow[],
    async getProfileVerifiedAt() {
      return store.verifiedAt;
    },
    async setProfileVerifiedAt(_userId: string, at: string | null) {
      store.verifiedAt = at;
    },
    async listChallenges() {
      return [...store.rows];
    },
    async insertChallenge(row: Omit<CampusEmailChallengeRow, "id"> & { id?: string }) {
      const created: CampusEmailChallengeRow = { ...row, id: row.id ?? `ch-${store.rows.length + 1}` };
      store.rows.unshift(created);
      return created;
    },
    async invalidateOpenChallenges(_userId: string, at: string) {
      store.rows = store.rows.map((row) =>
        !row.consumed_at && !row.invalidated_at ? { ...row, invalidated_at: at } : row,
      );
    },
    async markDispatched(id: string, at: string) {
      store.rows = store.rows.map((row) => (row.id === id ? { ...row, dispatched_at: at } : row));
    },
    async consumeIfHashMatches() {
      return false;
    },
    async incrementAttempts() {
      return 0;
    },
  };
  return store;
}

describe("verification QA allowlist", () => {
  it("only the designated QA email can invoke the cycle", () => {
    expect(canInvokeVerificationQaCycle(ONBOARDING_QA_EMAIL)).toBe(true);
    expect(canInvokeVerificationQaCycle("student@uri.edu")).toBe(false);
    expect(() => assertVerificationQaCaller({ authenticatedEmail: "student@uri.edu" })).toThrow(
      /designated internal QA account/i,
    );
  });
});

describe("QA campus-code cycle", () => {
  it("resets only campus verification and sends a fresh code without touching the auth UUID", async () => {
    const store = createMemoryStore();
    const mailer = vi.fn(async () => undefined);
    const result = await startVerificationQaCycle({
      userId: AUTH_USER_ID,
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      store,
      mailer,
      secret: SECRET,
      generateCode: () => "654321",
    });
    expect(result.authUserId).toBe(AUTH_USER_ID);
    expect(result.emailSent).toBe(true);
    expect(store.verifiedAt).toBeNull();
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(store.rows[0]?.code_hash).toBe(
      hashCampusEmailCode({
        userId: AUTH_USER_ID,
        email: ONBOARDING_QA_EMAIL,
        code: "654321",
        secret: SECRET,
      }),
    );
  });

  it("rejects a normal user from the QA reset", async () => {
    const store = createMemoryStore();
    await expect(
      startVerificationQaCycle({
        userId: "other",
        authenticatedEmail: "student@uri.edu",
        store,
        mailer: async () => undefined,
        secret: SECRET,
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_QA_FORBIDDEN" });
    expect(store.verifiedAt).toBe("2026-01-01T00:00:00Z");
    expect(store.rows).toHaveLength(0);
  });

  it("can send a fresh code repeatedly after cooldown", async () => {
    const store = createMemoryStore();
    const mailer = vi.fn(async () => undefined);
    await startVerificationQaCycle({
      userId: AUTH_USER_ID,
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      store,
      mailer,
      secret: SECRET,
      generateCode: () => "111111",
    });
    await expect(
      startVerificationQaCycle({
        userId: AUTH_USER_ID,
        authenticatedEmail: ONBOARDING_QA_EMAIL,
        store,
        mailer,
        secret: SECRET,
        generateCode: () => "222222",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    const second = await startVerificationQaCycle({
      userId: AUTH_USER_ID,
      authenticatedEmail: ONBOARDING_QA_EMAIL,
      store,
      mailer,
      secret: SECRET,
      generateCode: () => "222222",
      now: new Date(Date.now() + 61_000),
    });
    expect(second.emailSent).toBe(true);
    expect(second.authUserId).toBe(AUTH_USER_ID);
    expect(mailer).toHaveBeenCalledTimes(2);
  });
});
