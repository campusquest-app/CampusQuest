import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import { ApiError } from "@/lib/server/http";
import {
  PASSWORD_RESET_EMAIL_LIMIT,
  PASSWORD_RESET_IP_LIMIT,
  PASSWORD_RESET_WINDOW_SECONDS,
  enforcePasswordResetRateLimits,
  passwordResetRateBucket,
  type PasswordResetRateConsume,
} from "@/lib/server/passwordResetRateLimit";

const SECRET = "test-email-verification-secret";
const EMAIL = "student@uri.edu";

function sharedStore(now: () => number = Date.now) {
  const rows = new Map<string, { count: number; windowStartedAt: number }>();
  const tails = new Map<string, Promise<unknown>>();

  const consume: PasswordResetRateConsume = (bucket, limit, windowSeconds) => {
    const previous = tails.get(bucket) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(bucket, previous.then(() => turn));
    return previous.then(async () => {
      try {
        const started = now();
        const row = rows.get(bucket);
        if (!row || started >= row.windowStartedAt + windowSeconds * 1000) {
          rows.set(bucket, { count: 1, windowStartedAt: started });
          return true;
        }
        if (row.count >= limit) return false;
        row.count += 1;
        return true;
      } finally {
        release();
      }
    });
  };

  return { consume };
}

describe("password reset rate buckets", () => {
  it("stores an HMAC instead of the email or IP", () => {
    const emailBucket = passwordResetRateBucket("email", "Student@URI.edu", SECRET);
    const ipBucket = passwordResetRateBucket("ip", "203.0.113.8", SECRET);
    expect(emailBucket).toMatch(/^[0-9a-f]{64}$/);
    expect(emailBucket).toBe(passwordResetRateBucket("email", "student@uri.edu", SECRET));
    expect(emailBucket).not.toContain("student");
    expect(emailBucket).not.toContain("@");
    expect(ipBucket).not.toContain("203.0.113.8");
    expect(emailBucket).not.toBe(ipBucket);
  });
});

describe("shared password reset limits", () => {
  const env = { EMAIL_VERIFICATION_SECRET: SECRET };

  it("allows 3 requests per email and 8 per IP inside 15 minutes", async () => {
    const store = sharedStore();
    for (let attempt = 0; attempt < PASSWORD_RESET_EMAIL_LIMIT; attempt += 1) {
      await expect(
        enforcePasswordResetRateLimits({
          email: EMAIL,
          ip: `203.0.113.${attempt}`,
          env,
          consume: store.consume,
        }),
      ).resolves.toBeUndefined();
    }
    await expect(
      enforcePasswordResetRateLimits({
        email: EMAIL,
        ip: "203.0.113.50",
        env,
        consume: store.consume,
      }),
    ).rejects.toMatchObject({ status: 429, code: "EMAIL_RATE_LIMIT", message: AUTH_EMAIL_USER_MESSAGES.rateLimited });

    const freshEmail = sharedStore();
    for (let attempt = 0; attempt < PASSWORD_RESET_IP_LIMIT; attempt += 1) {
      await enforcePasswordResetRateLimits({
        email: `student${attempt}@uri.edu`,
        ip: "198.51.100.10",
        env,
        consume: freshEmail.consume,
      });
    }
    await expect(
      enforcePasswordResetRateLimits({
        email: "another@uri.edu",
        ip: "198.51.100.10",
        env,
        consume: freshEmail.consume,
      }),
    ).rejects.toMatchObject({ status: 429, message: AUTH_EMAIL_USER_MESSAGES.rateLimited });
  });

  it("starts a new window after 15 minutes", async () => {
    let now = 1_000_000;
    const store = sharedStore(() => now);
    for (let attempt = 0; attempt < PASSWORD_RESET_EMAIL_LIMIT; attempt += 1) {
      await enforcePasswordResetRateLimits({ email: EMAIL, ip: `203.0.113.${attempt}`, env, consume: store.consume });
    }
    now += PASSWORD_RESET_WINDOW_SECONDS * 1000;
    await expect(
      enforcePasswordResetRateLimits({ email: EMAIL, ip: "203.0.113.9", env, consume: store.consume }),
    ).resolves.toBeUndefined();
  });

  it("lets only the limit through when requests arrive together", async () => {
    const store = sharedStore();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        enforcePasswordResetRateLimits({
          email: EMAIL,
          ip: `203.0.113.${index}`,
          env,
          consume: store.consume,
        }),
      ),
    );
    const allowed = results.filter((result) => result.status === "fulfilled");
    const blocked = results.filter((result) => result.status === "rejected");
    expect(allowed).toHaveLength(PASSWORD_RESET_EMAIL_LIMIT);
    expect(blocked).toHaveLength(9);
    for (const result of blocked) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ApiError);
        expect(result.reason.message).toBe(AUTH_EMAIL_USER_MESSAGES.rateLimited);
        expect(result.reason.message).not.toContain(EMAIL);
      }
    }
  });

  it("denies the reset when the limiter is unavailable and does not reveal the account", async () => {
    await expect(
      enforcePasswordResetRateLimits({
        email: EMAIL,
        ip: "203.0.113.8",
        env: {},
        consume: async () => true,
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      message: AUTH_EMAIL_USER_MESSAGES.generic,
    });

    await expect(
      enforcePasswordResetRateLimits({
        email: EMAIL,
        ip: "203.0.113.8",
        env,
        consume: async () => {
          throw new Error("database unavailable");
        },
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: AUTH_EMAIL_USER_MESSAGES.generic,
    });
  });

  it("keeps signup verification on its own limiter and locks reset counts in Postgres", () => {
    const reset = readFileSync(join(process.cwd(), "app/api/auth/reset-password/route.ts"), "utf8");
    const signup = readFileSync(join(process.cwd(), "app/api/auth/signup/route.ts"), "utf8");
    const verification = readFileSync(join(process.cwd(), "app/api/auth/email-verification/send/route.ts"), "utf8");
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261111043000_password_reset_rate_limits.sql"),
      "utf8",
    );
    expect(reset.indexOf("await enforcePasswordResetRateLimits")).toBeLessThan(
      reset.indexOf("await deliverPasswordResetEmail"),
    );
    expect(reset).not.toContain("enforceKeyedRateLimit");
    expect(signup).toContain("enforceKeyedRateLimit");
    expect(signup).not.toContain("consume_password_reset_rate_limit");
    expect(verification).not.toContain("consume_password_reset_rate_limit");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("existing_count >= p_limit");
    expect(sql).not.toMatch(/email text/i);
  });
});
