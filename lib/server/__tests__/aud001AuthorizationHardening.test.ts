import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AUD-001 regression guard.
 *
 * The database posture is asserted against the forward-only migration, and the
 * server modules are asserted to write authoritative rows with the trusted
 * (service-role) client instead of the caller's RLS-scoped client.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const AUD001_MIGRATION = "20260917120000_aud001_authorization_hardening.sql";

const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, AUD001_MIGRATION), "utf8");

function droppedPolicy(policy: string, table: string): boolean {
  return new RegExp(
    `drop\\s+policy\\s+if\\s+exists\\s+"${policy}"\\s+on\\s+public\\.${table}\\s*;`,
    "i",
  ).test(migrationSql);
}

function createdPolicy(policy: string, table: string): boolean {
  return new RegExp(
    `create\\s+policy\\s+"${policy}"\\s*\\n?\\s*on\\s+public\\.${table}\\b`,
    "i",
  ).test(migrationSql);
}

function policyBody(policy: string): string {
  const start = migrationSql.indexOf(`create policy "${policy}"`);
  expect(start).toBeGreaterThan(-1);
  const end = migrationSql.indexOf(";", start);
  return migrationSql.slice(start, end);
}

function functionBody(fn: string): string {
  const match = migrationSql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)([\\s\\S]*?)\\$\\$;`, "i"),
  );
  expect(match, `function ${fn} is missing from ${AUD001_MIGRATION}`).not.toBeNull();
  return match![0];
}

describe("AUD-001 migration is a single forward-only security migration", () => {
  it("is the newest migration and does not edit historical migrations", () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
    expect(files).toContain(AUD001_MIGRATION);
    const newest = [...files].sort().at(-1);
    expect(newest).toBe(AUD001_MIGRATION);
  });

  it("never disables row level security and always pairs DROP POLICY IF EXISTS with CREATE POLICY", () => {
    expect(/disable\s+row\s+level\s+security/i.test(migrationSql)).toBe(false);
    const bareDrops = migrationSql.match(/drop\s+policy(?!\s+if\s+exists)/gi);
    expect(bareDrops).toBeNull();
  });

  it("uses the exact audited policy names for every DROP POLICY statement", () => {
    const expected = [
      ["user_school_verifications", "user_school_verifications upsert own"],
      ["user_school_verifications", "user_school_verifications update own"],
      ["user_school_verifications", "user_school_verifications read own"],
      ["organization_members", "organization_members upsert self"],
      ["organization_members", "organization_members update self"],
      ["organization_members", "organization_members update owner admin"],
      ["direct_conversation_participants", "direct_conversation_participants own rows"],
      ["direct_conversation_participants", "direct_conversation_participants read own"],
      ["direct_conversation_participants", "direct_conversation_participants update own markers"],
      ["direct_messages", "direct_messages sender insert"],
      ["student_connections", "student_connections own rows"],
      ["student_connections", "student_connections read own"],
      ["student_connections", "student_connections addressee respond"],
      ["student_connections", "student_connections party delete"],
      ["quad_posts", "Authenticated users read quad posts"],
      ["quad_posts", "quad_posts select visible"],
      ["boss_attempts", "users can insert own boss attempts"],
      ["boss_attempts", "users can view own boss attempts"],
      ["boss_drops", "Users insert own boss drops"],
      ["user_stats", "user_stats insert own row"],
      ["user_stats", "user_stats update own row"],
      ["user_stats", "users update own stats"],
      ["user_stats", "users insert own stats"],
      ["user_inventory", "users can insert own inventory items"],
      ["user_inventory", "users can update own inventory items"],
      ["user_inventory", "users can delete own inventory items"],
      ["user_inventory", "users can view own inventory"],
    ]
      .map(([table, policy]) => `${table}::${policy}`)
      .sort();

    const actual = Array.from(
      migrationSql.matchAll(
        /drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+public\.([a-z_]+)\s*;/gi,
      ),
    )
      .map((match) => `${match[2]}::${match[1]}`)
      .sort();

    expect(actual).toEqual(expected);
    expect(migrationSql).not.toMatch(
      /organization_members\s+(?:upsertself|updateself|updateowner\s+admin)/i,
    );
  });

  it("pins search_path on every function it defines", () => {
    const defined = Array.from(migrationSql.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)).map((m) => m[1]);
    expect(defined.length).toBeGreaterThan(0);
    for (const fn of defined) {
      expect(functionBody(fn), `${fn} must pin search_path`).toMatch(
        /set\s+search_path\s*=\s*public,\s*pg_temp/i,
      );
    }
  });

  it("restricts EXECUTE on every SECURITY DEFINER helper it exposes", () => {
    for (const fn of ["cq_viewer_blocked_with", "cq_conversation_blocked_for_viewer", "cq_viewer_org_role"]) {
      expect(functionBody(fn)).toMatch(/security\s+definer/i);
      expect(migrationSql).toMatch(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\(uuid\\)\\s+from\\s+public\\s*;`, "i"),
      );
      expect(migrationSql).toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\(uuid\\)\\s+to\\s+authenticated\\s*;`, "i"),
      );
    }
  });

  it("does not duplicate or weaken the existing profiles protections", () => {
    expect(migrationSql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.block_profiles_role_escalation/i);
    expect(migrationSql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.protect_campus_email_verified_at/i);
    expect(migrationSql).not.toMatch(/drop\s+trigger[^\n]*trg_block_profiles_role_escalation/i);
    expect(migrationSql).not.toMatch(/drop\s+trigger[^\n]*trg_protect_campus_email_verified_at/i);
    expect(migrationSql).not.toMatch(/drop\s+trigger[^\n]*trg_enforce_quad_post_posted_as/i);
  });

  it("only exempts trusted (non-browser) sessions", () => {
    const fn = functionBody("cq_is_trusted_writer");
    // A PostgREST request context means only service_role is trusted.
    expect(fn).toMatch(/current_setting\('request\.jwt\.claims',\s*true\)/i);
    expect(fn).toMatch(/coalesce\(auth\.role\(\),\s*''\)\s*=\s*'service_role'/i);
    // No request context at all (migration / psql / cron) is an owner session.
    expect(fn).toMatch(/coalesce\(auth\.role\(\),\s*''\)\s+not\s+in\s+\('authenticated',\s*'anon'\)/i);
  });
});

describe("AUD-001 (A) user_school_verifications", () => {
  it("removes client INSERT/UPDATE and keeps own read", () => {
    expect(droppedPolicy("user_school_verifications upsert own", "user_school_verifications")).toBe(true);
    expect(droppedPolicy("user_school_verifications update own", "user_school_verifications")).toBe(true);
    expect(createdPolicy("user_school_verifications read own", "user_school_verifications")).toBe(true);
    expect(migrationSql).not.toMatch(
      /create\s+policy\s+"user_school_verifications (upsert|update) own"/i,
    );
  });
});

describe("AUD-001 (B) organization_members", () => {
  it("self INSERT can no longer grant authority", () => {
    const body = policyBody("organization_members upsert self");
    expect(body).toMatch(/for\s+insert/i);
    expect(body).toMatch(/coalesce\(org_role,\s*'member'\)\s*=\s*'member'/i);
    expect(body).toMatch(/coalesce\(status,\s*'approved'\)\s*=\s*'approved'/i);
    expect(body).toMatch(/coalesce\(role,\s*'member'\)\s+in\s+\('member',\s*'follower'\)/i);
  });

  it("removes the second permissive self UPDATE policy", () => {
    expect(droppedPolicy("organization_members update self", "organization_members")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"organization_members update self"/i);
  });

  it("self UPDATE freezes org_role/status/role and only owners change roles", () => {
    const fn = functionBody("enforce_organization_member_write");
    expect(fn).toMatch(/new\.org_role\s*:=\s*old\.org_role/);
    expect(fn).toMatch(/new\.status\s*:=\s*old\.status/);
    expect(fn).toMatch(/new\.role\s*:=\s*old\.role/);
    expect(fn).toMatch(/only the organization owner may change member roles/);
    expect(fn).toMatch(/admins cannot modify the organization owner/);
    expect(fn).toMatch(/organization membership identity is immutable/);
    expect(migrationSql).toMatch(
      /create\s+trigger\s+trg_enforce_organization_member_write[\s\S]*?on\s+public\.organization_members/i,
    );
  });
});

describe("AUD-001 (C) direct_conversation_participants", () => {
  it("drops the FOR ALL policy so removed members cannot re-insert themselves", () => {
    expect(droppedPolicy("direct_conversation_participants own rows", "direct_conversation_participants")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"direct_conversation_participants own rows"/i);
    expect(createdPolicy("direct_conversation_participants read own", "direct_conversation_participants")).toBe(true);
    expect(createdPolicy("direct_conversation_participants update own markers", "direct_conversation_participants")).toBe(true);
  });

  it("does not grant client INSERT or DELETE on conversation membership", () => {
    const created = Array.from(migrationSql.matchAll(
      /create\s+policy\s+"([^"]+)"\s*\n?\s*on\s+public\.direct_conversation_participants\s+for\s+(\w+)/gi,
    )).map((m) => m[2].toLowerCase());
    expect(created.sort()).toEqual(["select", "update"]);
  });

  it("freezes membership identity on self update", () => {
    const fn = functionBody("enforce_dm_participant_self_update");
    expect(fn).toMatch(/new\.conversation_id\s*:=\s*old\.conversation_id/);
    expect(fn).toMatch(/new\.user_id\s*:=\s*old\.user_id/);
    expect(fn).toMatch(/new\.role\s*:=\s*old\.role/);
  });
});

describe("AUD-001 (D) direct_messages", () => {
  it("applies the block predicate on sender INSERT", () => {
    const body = policyBody("direct_messages sender insert");
    expect(body).toMatch(/auth\.uid\(\)\s*=\s*sender_id/i);
    expect(body).toMatch(/direct_conversation_participants/i);
    expect(body).toMatch(/not\s+public\.cq_conversation_blocked_for_viewer\(/i);
  });
});

describe("AUD-001 (E) student_connections", () => {
  it("removes FOR ALL and forbids client INSERT of accepted friendships", () => {
    expect(droppedPolicy("student_connections own rows", "student_connections")).toBe(true);
    const created = Array.from(migrationSql.matchAll(
      /create\s+policy\s+"([^"]+)"\s*\n?\s*on\s+public\.student_connections\s+for\s+(\w+)/gi,
    )).map((m) => m[2].toLowerCase());
    expect(created.sort()).toEqual(["delete", "select", "update"]);
  });

  it("only lets the addressee move a pending request to accepted/declined", () => {
    const body = policyBody("student_connections addressee respond");
    expect(body).toMatch(/using\s*\(auth\.uid\(\)\s*=\s*addressee_id\s+and\s+status\s*=\s*'pending'\)/i);
    expect(body).toMatch(/with\s+check\s*\(auth\.uid\(\)\s*=\s*addressee_id\s+and\s+status\s+in\s+\('accepted',\s*'declined'\)\)/i);

    const fn = functionBody("enforce_student_connection_transition");
    expect(fn).toMatch(/connection participants are immutable/);
    expect(fn).toMatch(/only pending connection requests can be answered/);
    expect(fn).toMatch(/only the addressee can answer a connection request/);
  });
});

describe("AUD-001 (F) quad_posts visibility", () => {
  it("replaces the blanket authenticated SELECT", () => {
    expect(droppedPolicy("Authenticated users read quad posts", "quad_posts")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"Authenticated users read quad posts"/i);
  });

  it("enforces author/public/accepted-friends plus block and hidden-account rules", () => {
    const body = policyBody("quad_posts select visible");
    expect(body).toMatch(/quad_posts\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(body).toMatch(/quad_posts\.visibility\s*=\s*'public'/i);
    expect(body).toMatch(/quad_posts\.visibility\s*=\s*'friends'/i);
    expect(body).toMatch(/student_connections[\s\S]*c\.status\s*=\s*'accepted'/i);
    expect(body).toMatch(/not\s+public\.cq_viewer_blocked_with\(quad_posts\.user_id\)/i);
    expect(body).toMatch(/author\.is_hidden/i);
    expect(body).toMatch(/author\.is_test_user/i);
    expect(body).toMatch(/author\.role,\s*''\)\s*=\s*'qa'/i);
  });
});

describe("AUD-001 (G) boss_attempts", () => {
  it("removes the client INSERT policy and keeps own read", () => {
    expect(droppedPolicy("users can insert own boss attempts", "boss_attempts")).toBe(true);
    expect(droppedPolicy("Users insert own boss drops", "boss_drops")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"users can insert own boss attempts"/i);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"Users insert own boss drops"/i);
    expect(createdPolicy("users can view own boss attempts", "boss_attempts")).toBe(true);
  });
});

describe("AUD-001 (H) guilds", () => {
  it("freezes total_xp / member_count / owner_id for browser writes", () => {
    const fn = functionBody("enforce_guild_economy_fields");
    expect(fn).toMatch(/new\.total_xp\s*:=\s*0/);
    expect(fn).toMatch(/new\.member_count\s*:=\s*1/);
    expect(fn).toMatch(/new\.total_xp\s*:=\s*old\.total_xp/);
    expect(fn).toMatch(/new\.member_count\s*:=\s*old\.member_count/);
    expect(fn).toMatch(/new\.owner_id\s*:=\s*old\.owner_id/);
  });
});

describe("AUD-001 (I) user_stats", () => {
  it("drops the permissive legacy insert policy that defeated the hardened one", () => {
    expect(droppedPolicy("user_stats insert own row", "user_stats")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"user_stats insert own row"/i);
    expect(droppedPolicy("user_stats update own row", "user_stats")).toBe(true);
    expect(droppedPolicy("users update own stats", "user_stats")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"users update own stats"/i);
  });

  it("recreates the hardened all-zero insert policy", () => {
    const body = policyBody("users insert own stats");
    for (const column of [
      "total_xp",
      "level",
      "strength",
      "stamina",
      "knowledge",
      "social",
      "focus",
      "bosses_defeated",
      "final_bosses_defeated",
      "quests_completed",
      "current_streak",
      "longest_streak",
      "streak_saves",
    ]) {
      expect(body, `${column} must be pinned on insert`).toMatch(new RegExp(`coalesce\\(${column},`));
    }
  });
});

describe("AUD-001 (J) user_inventory", () => {
  it("removes client item minting and keeps own read", () => {
    expect(droppedPolicy("users can insert own inventory items", "user_inventory")).toBe(true);
    expect(droppedPolicy("users can update own inventory items", "user_inventory")).toBe(true);
    expect(droppedPolicy("users can delete own inventory items", "user_inventory")).toBe(true);
    expect(migrationSql).not.toMatch(/create\s+policy\s+"users can (insert|update|delete) own inventory items"/i);
    expect(createdPolicy("users can view own inventory", "user_inventory")).toBe(true);
  });
});

describe("AUD-001 (K) marketplace_offers", () => {
  it("keeps identity immutability and closes the business-manager bypass", () => {
    const fn = functionBody("enforce_marketplace_offer_update");
    expect(fn).toMatch(/marketplace offer identity fields are immutable/);
    expect(fn).toMatch(/buyers may only withdraw their own offers/);
    expect(fn).toMatch(/sellers may only accept or decline offers/);
    expect(fn).toMatch(/public\.is_student_business_manager\(listing_business\)/);
    expect(fn).toMatch(/only pending marketplace offers can change status/);
    expect(fn).toMatch(/only the buyer or the listing seller may change this offer/);
  });
});

describe("AUD-001 (profiles) server-owned columns", () => {
  it("freezes moderation, tester and streak columns without touching role handling", () => {
    const fn = functionBody("protect_profile_server_owned_fields");
    for (const column of [
      "is_hidden",
      "is_test_user",
      "is_internal_tester",
      "qa_selected_role",
      "streak_days",
      "last_activity_date",
      "last_active_at",
      "guild_id",
      "equipment_loadout_json",
      "character_stats_json",
      "beginner_chain_completed_at",
      "onboarding_completed",
      "onboarding_completed_at",
      "display_name_changed_at",
      "username_changed_at",
      "identity_weekly_change_events",
      "requested_school_at",
    ]) {
      expect(fn, `${column} must be frozen on update`).toMatch(
        new RegExp(`new\\.${column}\\s*:=\\s*old\\.${column}`),
      );
    }
    expect(fn).not.toMatch(/new\.role\s*:=/);
    expect(fn).not.toMatch(/new\.campus_email_verified_at\s*:=/);
  });

  it("keeps the same game_state_json allowlist the API applies", async () => {
    const fn = functionBody("protect_profile_server_owned_fields");
    const { CLIENT_GAME_STATE_JSON_KEYS } = await import("../profileSecurity");
    for (const key of Array.from(CLIENT_GAME_STATE_JSON_KEYS)) {
      expect(fn, `${key} must stay client-writable`).toContain(`'${key}'`);
    }
    for (const key of ["unlockedCosmetics", "guildIds", "miniGameTraining", "statPrestige"]) {
      expect(CLIENT_GAME_STATE_JSON_KEYS.has(key), `${key} is authoritative progression/membership state`).toBe(false);
      expect(fn).not.toContain(`'${key}'`);
    }
    // Server-owned keys are restored from the previous row.
    expect(fn).toMatch(/not\s*\(entry\.key\s*=\s*any\s*\(client_game_state_keys\)\)/i);
  });
});

describe("AUD-001 server-side write routing", () => {
  const adminFrom = vi.fn();
  const adminClient = { from: adminFrom };
  const userFrom = vi.fn();
  const userClient = { from: userFrom } as never;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../supabase", () => ({
      createAdminClient: () => adminClient,
      createUserClient: () => adminClient,
      createPublicClient: () => adminClient,
      requireAuthUser: vi.fn(),
      getBearerToken: vi.fn(),
    }));
    vi.doMock("../trustedStatsWrite", () => ({
      getTrustedStatsWriteClient: () => adminClient,
    }));
  });

  it("grants inventory items with the trusted client, never the caller's client", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    adminFrom.mockImplementation(() => ({ insert }));
    userFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }));

    const { addItemToInventory } = await import("../services");
    await addItemToInventory({ userClient, userId: "user-1", itemId: "item-1", quantity: 2, source: "boss" });

    expect(adminFrom).toHaveBeenCalledWith("user_inventory");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", item_id: "item-1", quantity: 2 }),
    );
    // The caller's RLS-scoped client is read-only here.
    expect(userFrom.mock.calls.every(([table]) => table === "user_inventory")).toBe(true);
  });

  it("writes school verification state with the service-role client", async () => {
    const upsert = vi.fn(() => ({
      select: () => ({
        single: async () => ({
          data: {
            user_id: "user-1",
            school_name: "University of Rhode Island",
            school_domain: "uri.edu",
            status: "verified",
            verified_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    }));
    adminFrom.mockImplementation(() => ({ upsert }));

    const { ensureSchoolVerificationForUser } = await import("../schoolVerification");
    await ensureSchoolVerificationForUser({
      userClient,
      user: {
        id: "user-1",
        email: "student@uri.edu",
        email_confirmed_at: new Date().toISOString(),
      },
    });

    expect(adminFrom).toHaveBeenCalledWith("user_school_verifications");
    expect(userFrom).not.toHaveBeenCalled();
  });
});

describe("AUD-001 (J) POST /api/inventory/add refuses client-initiated grants", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 403 for an ordinary authenticated user and writes nothing", async () => {
    const logSecurityEvent = vi.fn(async () => undefined);
    const adminFrom = vi.fn();
    vi.doMock("../supabase", () => ({
      requireAuthUser: async () => ({
        user: { id: "user-1" },
        userClient: { from: vi.fn() },
      }),
      createAdminClient: () => ({ from: adminFrom }),
      createUserClient: () => ({ from: adminFrom }),
      createPublicClient: () => ({ from: adminFrom }),
      getBearerToken: vi.fn(),
    }));
    vi.doMock("../profileSecurity", () => ({ logSecurityEvent }));
    vi.doMock("../security", () => ({ enforceRateLimit: vi.fn() }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { POST } = await import("@/app/api/inventory/add/route");
    const response = await POST(
      new Request("https://campusquest.test/api/inventory/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: "00000000-0000-4000-8000-000000000001", quantity: 9999 }),
      }),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVENTORY_SELF_GRANT_FORBIDDEN");
    expect(adminFrom).not.toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", eventType: "blocked_inventory_grant" }),
    );
    warn.mockRestore();
  });
});

describe("AUD-001 (G/J) POST /api/me/boss refuses client-selected rewards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 403 without persisting a boss drop or inventory grant", async () => {
    const logSecurityEvent = vi.fn(async () => undefined);
    vi.doMock("../supabase", () => ({
      requireAuthUser: async () => ({
        user: { id: "user-1" },
        userClient: { from: vi.fn() },
      }),
      createAdminClient: () => ({ from: vi.fn() }),
      createUserClient: vi.fn(),
      createPublicClient: vi.fn(),
      getBearerToken: vi.fn(),
    }));
    vi.doMock("../profileSecurity", () => ({ logSecurityEvent }));
    vi.doMock("../security", () => ({ enforceRateLimit: vi.fn() }));
    vi.doMock("../bossDrops", () => ({ fetchBossDropsForUser: vi.fn() }));

    const { POST } = await import("@/app/api/me/boss/route");
    const response = await POST(
      new Request("https://campusquest.test/api/me/boss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bossId: "client-selected-boss",
          cosmeticId: "rare-client-selected-item",
          quantity: 10,
        }),
      }),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("BOSS_DROP_SELF_GRANT_FORBIDDEN");
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", eventType: "blocked_boss_drop_grant" }),
    );
  });
});

describe("AUD-001 source-level routing guards", () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it("boss attempts and streak progression are written by the trusted client", () => {
    const services = read("lib/server/services.ts");
    const bossDrops = read("lib/server/bossDrops.ts");
    expect(services).toMatch(
      /getTrustedStatsWriteClient\(\)\s*\n?\s*\.from\("boss_attempts"\)\s*\n?\s*\.insert/,
    );
    expect(services).not.toMatch(/userClient\s*\n?\s*\.from\("boss_attempts"\)\s*\n?\s*\.insert/);
    expect(services).not.toMatch(/userClient\s*\n?\s*\.from\("user_inventory"\)\s*\n?\s*\.(insert|update)/);
    expect(services).not.toMatch(/userClient\.from\("user_inventory"\)\.(insert|update)/);
    const streakWrites = services.match(/streak_days:\s*nextStreakDays/g) ?? [];
    expect(streakWrites.length).toBe(2);
    expect(services.match(/getTrustedStatsWriteClient\(\)\s*\n?\s*\.from\("profiles"\)/g)?.length).toBe(2);
    expect(bossDrops).not.toMatch(/persistBossDrop|addItemToInventory/);
  });

  it("routes protected profile and organization state through authenticated server writers", () => {
    const profileRoute = read("app/api/me/profile/route.ts");
    expect(profileRoute).toMatch(/const profileWriter = createAdminClient\(\)/);
    expect(profileRoute).toMatch(/profileWriter\s*\n?\s*\.from\("profiles"\)\s*\n?\s*\.update\(patchForSchema\)/);

    const organizationManagement = read("lib/server/organizationManagement.ts");
    expect(organizationManagement).toMatch(
      /assertOrganizationOwner[\s\S]*?createAdminClient\(\)\s*\n?\s*\.from\("organization_members"\)\s*\n?\s*\.update/,
    );
    expect(organizationManagement).toMatch(
      /assertOrganizationAdmin[\s\S]*?createAdminClient\(\)\s*\n?\s*\.from\("organization_members"\)\s*\n?\s*\.delete/,
    );

    const activity = read("lib/server/userActivity.ts");
    expect(activity).toMatch(/touchUserActivitySafe\(auth\.user\.id,\s*createAdminClient\(\)\)/);
  });

  it("keeps tagged Quad reads behind caller-scoped RLS", () => {
    const taggedRoute = read("app/api/quad/tagged/[entityType]/[entityId]/route.ts");
    expect(taggedRoute).not.toMatch(/createAdminClient/);
    expect(taggedRoute.match(/auth\.userClient\s*\n?\s*\.from\("(?:post_tags|quad_posts)"\)/g)?.length).toBe(2);
  });

  it("service-role credentials stay server-only", () => {
    const supabaseServer = read("lib/server/supabase.ts");
    expect(supabaseServer).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    expect(supabaseServer).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    const browserClient = read("lib/supabase/client.ts");
    expect(browserClient).not.toMatch(/SERVICE_ROLE/);
  });
});
