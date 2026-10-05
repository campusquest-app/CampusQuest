import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProfileRoute } from "@/lib/client/appShellRoute";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261002200000_backfill_campus_email_verified_at.sql"),
  "utf8",
);

function sqlStatements(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBody = false;
  for (const part of source.replace(/--[^\n]*/g, "").split(/(\$\$|;)/)) {
    if (part === "$$") inDollarBody = !inDollarBody;
    if (part === ";" && !inDollarBody) {
      statements.push(current);
      current = "";
    } else {
      current += part;
    }
  }
  statements.push(current);
  return statements.map((s) => s.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
}

describe("legacy campus verification backfill migration", () => {
  const statements = sqlStatements(MIGRATION);
  const backfill = statements.find((s) => s.startsWith("update public.profiles"))!;
  const downgrade = statements.find((s) => s.startsWith("update public.user_school_verifications"))!;

  it("lets trusted (no request context) writers past the timestamp guard, so the backfill is not silently reverted", () => {
    const guard = statements.find((s) => s.includes("function public.protect_campus_email_verified_at"))!;
    expect(guard).toContain("if public.cq_is_trusted_writer() then return new;");
    expect(guard).toContain("new.campus_email_verified_at := old.campus_email_verified_at");
    expect(statements.indexOf(guard)).toBeLessThan(statements.indexOf(backfill));
  });

  it("only fills missing timestamps from the recorded verification time", () => {
    expect(backfill).toContain("set campus_email_verified_at = v.verified_at");
    expect(backfill).toContain("p.campus_email_verified_at is null");
    expect(backfill).toContain("v.verified_at is not null");
    expect(backfill).not.toContain("now()");
  });

  it("requires a verified URI row for the same user, a URI auth email, and a pre-rollout account", () => {
    expect(backfill).toContain("v.user_id = p.id");
    expect(backfill).toContain("u.id = p.id");
    expect(backfill).toContain("v.status = 'verified'");
    expect(backfill).toContain("lower(v.school_domain) = 'uri.edu'");
    expect(backfill).toContain("lower(split_part(u.email, '@', 2)) = 'uri.edu'");
    expect(backfill).toContain("u.email_confirmed_at is not null");
    expect(backfill).toContain("u.deleted_at is null");
    expect(backfill).toContain("u.created_at < timestamptz '2026-08-25 04:39:43+00'");
  });

  it("downgrades only verified rows whose profile is still unverified after the backfill", () => {
    expect(statements.indexOf(backfill)).toBeLessThan(statements.indexOf(downgrade));
    expect(downgrade).toContain("set status = 'pending'");
    expect(downgrade).toContain("v.status = 'verified'");
    expect(downgrade).toContain("p.campus_email_verified_at is null");
  });

  it("does not touch RLS", () => {
    expect(MIGRATION).not.toMatch(/disable row level security|drop policy|create policy/i);
  });
});

function mockSchoolVerificationDeps(args: {
  campusEmailVerifiedAt: string | null;
  identity?: { isPlatformAdmin: boolean; isInternalTester: boolean };
}) {
  const upsert = vi.fn((payload: Record<string, unknown>) => ({
    select: () => ({ single: async () => ({ data: payload, error: null }) }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { campus_email_verified_at: args.campusEmailVerifiedAt }, error: null }),
          }),
        }),
      };
    }
    return { upsert };
  });
  vi.doMock("@/lib/server/supabase", () => ({ createAdminClient: () => ({ from }) }));
  vi.doMock("@/lib/server/campusAccess", () => ({
    resolveCampusAccessIdentity: async () => args.identity ?? { isPlatformAdmin: false, isInternalTester: false },
    userIdHasCampusBypassAccess: async () => false,
  }));
  return { upsert, from };
}

const student = { id: "user-1", email: "student@uri.edu", email_confirmed_at: "2026-07-01T00:00:00.000Z" };

describe("core access after the backfill", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/server/supabase");
    vi.doUnmock("@/lib/server/campusAccess");
  });

  it.each([
    ["a legacy student whose timestamp was backfilled", "2026-07-15T13:15:24.554Z"],
    ["a student who already had a timestamp", "2026-09-01T10:00:00.000Z"],
    ["a new signup who just entered the 6-digit code", "2026-10-02T19:00:00.000Z"],
  ])("grants %s", async (_label, at) => {
    const { upsert } = mockSchoolVerificationDeps({ campusEmailVerifiedAt: at });
    const { requireVerifiedSchoolForCoreAccess } = await import("@/lib/server/schoolVerification");
    const result = await requireVerifiedSchoolForCoreAccess({ userClient: {} as never, user: student });
    expect(result).toMatchObject({ status: "verified", schoolDomain: "uri.edu", schoolName: "University of Rhode Island" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: "verified" }), { onConflict: "user_id" });
  });

  it("denies a pending or brand-new student even when Supabase marked the email confirmed", async () => {
    mockSchoolVerificationDeps({ campusEmailVerifiedAt: null });
    const { requireVerifiedSchoolForCoreAccess } = await import("@/lib/server/schoolVerification");
    await expect(
      requireVerifiedSchoolForCoreAccess({ userClient: {} as never, user: student }),
    ).rejects.toMatchObject({ status: 403, code: "SCHOOL_VERIFICATION_REQUIRED" });
  });

  it.each([
    ["platform admins", { isPlatformAdmin: true, isInternalTester: false }],
    ["internal testers", { isPlatformAdmin: false, isInternalTester: true }],
  ])("keeps the bypass for %s without reading campus verification", async (_label, identity) => {
    const { from } = mockSchoolVerificationDeps({ campusEmailVerifiedAt: null, identity });
    const { requireVerifiedSchoolForCoreAccess } = await import("@/lib/server/schoolVerification");
    await expect(
      requireVerifiedSchoolForCoreAccess({ userClient: {} as never, user: { id: "admin-1", email: "ops@example.com" } }),
    ).resolves.toMatchObject({ status: "verified" });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("onboarding routing after the backfill", () => {
  const completed = {
    onboarding_completed: true,
    role: "student" as const,
    display_name_changed_at: "2026-01-01T00:00:00.000Z",
  };

  it("sends a backfilled legacy student straight to the app", () => {
    expect(resolveProfileRoute({ ...completed, campus_email_verified_at: "2026-07-15T13:15:24.554Z" })).toBe("app");
  });

  it("sends an unverified account to the verification gate", () => {
    expect(resolveProfileRoute({ ...completed, campus_email_verified_at: null })).toBe("demographics_gate");
  });

  it("does not pull a verified admin into student onboarding", () => {
    expect(
      resolveProfileRoute({ ...completed, role: "admin", campus_email_verified_at: "2026-08-28T15:27:59.620Z" }),
    ).toBe("app");
  });
});
