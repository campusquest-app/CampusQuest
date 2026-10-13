import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePartnerSuggestion } from "@/lib/partners/partnerSuggestion";
import { ApiError } from "@/lib/server/http";
import {
  addPartnerFavorite,
  isMissingTableError,
  listPartnerFavorites,
  removePartnerFavorite,
} from "@/lib/server/partnerFavorites";
import { PARTNER_SUGGESTION_DAILY_LIMIT, submitPartnerSuggestion } from "@/lib/server/partnerSuggestions";

type Call = { table: string; op: string; args: unknown[] };
type Result = { data?: unknown; error: { code?: string; message?: string } | null };

/** Chainable stand-in for the user-scoped Supabase client; records every call. */
function mockUserClient(results: Partial<Record<string, Result>>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      let op = "select";
      const builder: Record<string, unknown> = {};
      const chain =
        (name: string) =>
        (...args: unknown[]) => {
          calls.push({ table, op: name, args });
          if (["select", "insert", "upsert", "delete"].includes(name) && op === "select") op = name;
          if (name === "insert" || name === "upsert" || name === "delete") op = name;
          return builder;
        };
      for (const name of ["select", "insert", "upsert", "delete", "eq", "gte", "order", "single"]) {
        builder[name] = chain(name);
      }
      builder.then = (resolve: (value: Result) => unknown) =>
        Promise.resolve(results[`${table}:${op}`] ?? { data: [], error: null }).then(resolve);
      return builder;
    },
  };
  return { client: client as never, calls };
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const USER = "22222222-2222-2222-2222-222222222222";

describe("partner favorites", () => {
  it("lists only the caller's rows and drops ids that are no longer partners", async () => {
    const { client, calls } = mockUserClient({
      "partner_favorites:select": {
        data: [{ partner_id: "the-sandbar-cafe" }, { partner_id: "removed-shop" }, { partner_id: "daisys-chicken-ice-cream" }],
        error: null,
      },
    });
    expect(await listPartnerFavorites(client, USER)).toEqual(["the-sandbar-cafe", "daisys-chicken-ice-cream"]);
    expect(calls).toContainEqual({ table: "partner_favorites", op: "eq", args: ["user_id", USER] });
  });

  it("saves idempotently for a known partner and rejects unknown partners", async () => {
    const { client, calls } = mockUserClient({});
    await addPartnerFavorite(client, USER, "daisys-chicken-ice-cream");
    expect(calls).toContainEqual({
      table: "partner_favorites",
      op: "upsert",
      args: [
        { user_id: USER, partner_id: "daisys-chicken-ice-cream" },
        { onConflict: "user_id,partner_id", ignoreDuplicates: true },
      ],
    });
    expect((await caught(addPartnerFavorite(client, USER, "made-up"))).status).toBe(404);
  });

  it("removes only the caller's row", async () => {
    const { client, calls } = mockUserClient({});
    await removePartnerFavorite(client, USER, "the-sandbar-cafe");
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["user_id", USER],
      ["partner_id", "the-sandbar-cafe"],
    ]);
  });

  it("reports 503 when the migration has not been applied yet", async () => {
    const { client } = mockUserClient({
      "partner_favorites:select": { data: null, error: { code: "PGRST205", message: "Could not find the table" } },
    });
    const error = await caught(listPartnerFavorites(client, USER));
    expect(error.status).toBe(503);
    expect(error.code).toBe("PARTNER_FAVORITES_UNAVAILABLE");
  });

  it("recognises missing-table errors", () => {
    expect(isMissingTableError({ code: "42P01" }, "x")).toBe(true);
    expect(isMissingTableError({ message: 'relation "public.partner_favorites" does not exist' }, "partner_favorites")).toBe(true);
    expect(isMissingTableError({ code: "23505", message: "duplicate" }, "partner_favorites")).toBe(false);
    expect(isMissingTableError(null, "partner_favorites")).toBe(false);
  });
});

describe("partner suggestions", () => {
  const input = { businessName: "Brickley's Ice Cream", location: "Narragansett", reason: null };

  it("stores a pending suggestion for the caller", async () => {
    const { client, calls } = mockUserClient({
      "partner_suggestions:insert": { data: { id: "s1", created_at: "2026-10-12T17:00:00Z" }, error: null },
    });
    expect(await submitPartnerSuggestion({ admin: client, userId: USER, input })).toEqual({
      id: "s1",
      createdAt: "2026-10-12T17:00:00Z",
    });
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toEqual({
      user_id: USER,
      business_name: "Brickley's Ice Cream",
      location: "Narragansett",
      reason: null,
    });
  });

  it("enforces the daily limit before inserting", async () => {
    const rows = Array.from({ length: PARTNER_SUGGESTION_DAILY_LIMIT }, (_, i) => ({ business_name: `Shop ${i}` }));
    const { client, calls } = mockUserClient({ "partner_suggestions:select": { data: rows, error: null } });
    const error = await caught(submitPartnerSuggestion({ admin: client, userId: USER, input }));
    expect(error.status).toBe(429);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("rejects a duplicate suggestion from the same user", async () => {
    const { client } = mockUserClient({
      "partner_suggestions:select": { data: [{ business_name: "brickley's ice cream " }], error: null },
    });
    expect((await caught(submitPartnerSuggestion({ admin: client, userId: USER, input }))).status).toBe(409);
  });

  it("maps the database trigger limit to 429 and a missing table to 503", async () => {
    const limited = mockUserClient({
      "partner_suggestions:insert": { data: null, error: { message: "partner_suggestions_daily_limit" } },
    });
    expect((await caught(submitPartnerSuggestion({ admin: limited.client, userId: USER, input }))).status).toBe(429);
    const racedDuplicate = mockUserClient({
      "partner_suggestions:insert": { data: null, error: { message: "partner_suggestions_duplicate" } },
    });
    expect((await caught(submitPartnerSuggestion({ admin: racedDuplicate.client, userId: USER, input }))).status).toBe(409);
    const missing = mockUserClient({
      "partner_suggestions:select": { data: null, error: { code: "42P01" } },
    });
    expect((await caught(submitPartnerSuggestion({ admin: missing.client, userId: USER, input }))).status).toBe(503);
  });
});

describe("parsePartnerSuggestion", () => {
  it("trims and normalizes text and turns blanks into null", () => {
    const parsed = parsePartnerSuggestion({ businessName: "  Java   Jazz \u0007", location: "   ", reason: "Great\n\n\n\nlattes" });
    expect(parsed).toEqual({
      ok: true,
      value: { businessName: "Java Jazz", location: null, reason: "Great\n\nlattes" },
      honeypot: false,
    });
  });

  it("requires a business name and enforces length limits", () => {
    expect(parsePartnerSuggestion({ businessName: " " })).toMatchObject({ ok: false, message: "Enter a business name." });
    expect(parsePartnerSuggestion({})).toMatchObject({ ok: false });
    expect(parsePartnerSuggestion({ businessName: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(parsePartnerSuggestion({ businessName: "Ok", reason: "y".repeat(501) })).toMatchObject({ ok: false });
    expect(parsePartnerSuggestion(null)).toMatchObject({ ok: false });
  });

  it("flags the hidden honeypot field", () => {
    expect(parsePartnerSuggestion({ businessName: "Bot Shop", website: "http://spam" })).toMatchObject({
      ok: true,
      honeypot: true,
    });
  });
});

describe("student perks migration", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261012120000_student_perks.sql"), "utf8");

  it("enables RLS on every new table", () => {
    for (const table of ["partner_favorites", "partner_suggestions", "partner_engagement_events"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from anon;`);
    }
  });

  it("scopes favorites and suggestions to auth.uid() and keeps analytics service-role only", () => {
    expect(sql.match(/using \(user_id = auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("with check (user_id = auth.uid())");
    expect(sql).not.toMatch(/on public\.partner_engagement_events for/);
    expect(sql).not.toMatch(/grant [a-z, ]+ on table public\.partner_engagement_events to (anon|authenticated)/);
    expect(sql).toContain("grant select on table public.partner_suggestions to authenticated;");
    expect(sql).not.toMatch(/on public\.partner_suggestions for (insert|update|delete|all)/);
    expect(sql).not.toMatch(/grant [a-z, ]*(insert|update|delete)[a-z, ]* on table public\.partner_suggestions to authenticated/);
  });

  it("serializes the suggestion limit per user and stamps rows with server time", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('partner_suggestions:' \|\| new\.user_id::text, 0\)\)/);
    const lock = sql.indexOf("pg_advisory_xact_lock");
    expect(lock).toBeLessThan(sql.indexOf("select count(*) into recent_count"));
    expect(sql).toContain("new.created_at := now();");
    expect(sql).toContain("new.status := 'pending';");
    expect(sql).toContain("raise exception 'partner_suggestions_daily_limit'");
    expect(sql).toContain("raise exception 'partner_suggestions_duplicate'");
  });

  it("states that analytics are not purchases or redemptions and only creates tables", () => {
    expect(sql).toMatch(/NOT purchases or redemptions/);
    expect(sql).not.toMatch(/\b(drop table|delete from|update public\.)/i);
  });
});

describe("partner API routes", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("use the session user for favorites and suggestions", () => {
    for (const path of ["app/api/partners/favorites/route.ts", "app/api/partners/suggestions/route.ts"]) {
      const route = read(path);
      expect(route).toContain("requireAuthUser(request)");
      expect(route).not.toMatch(/body\??\.(userId|user_id)/);
    }
    expect(read("app/api/partners/favorites/route.ts")).not.toContain("createAdminClient");
  });

  it("inserts suggestions with the service role only after auth, rate limit, and account-safety checks", () => {
    const source = read("app/api/partners/suggestions/route.ts");
    const route = source.slice(source.indexOf("export async function POST"));
    const order = [
      "requireAuthUser(request)",
      "enforceRateLimit(",
      "assertAccountCanSocialize(",
      "parsePartnerSuggestion(body)",
      "createAdminClient()",
    ];
    const positions = order.map((needle) => route.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(route).toContain("userId: user.id");
  });

  it("admin suggestion listing requires an admin", () => {
    expect(read("app/api/internal/admin/partner-suggestions/route.ts")).toContain("requireAdminUser");
  });
});
