import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_SOURCE_ID_CONFLICT,
  formatSourceExternalIdConflictError,
  isMissingOnConflictTargetError,
  upsertBySourceExternalId,
} from "@/lib/server/eventSources/upsertBySourceExternalId";
import { SCHEMA_INCOMPATIBLE_DIAGNOSTIC } from "@/lib/server/eventSources/schemaHealth";
import { formatAdminSyncErrorSummary } from "@/lib/eventSources/providerHealth";

const root = join(__dirname, "../../..");

function mockAdmin(handlers: {
  existingId?: string | null;
  secondLookupId?: string | null;
  updateError?: { message: string } | null;
  insertError?: { message: string; code?: string } | null;
  insertId?: string;
}) {
  let selectCalls = 0;
  const maybeSingle = vi.fn(async () => {
    selectCalls += 1;
    if (selectCalls === 1) {
      return {
        data: handlers.existingId ? { id: handlers.existingId } : null,
        error: null,
      };
    }
    const id = handlers.secondLookupId ?? handlers.existingId;
    return { data: id ? { id } : null, error: null };
  });
  const updateEq = vi.fn(async () => ({ error: handlers.updateError ?? null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const insertSingle = vi.fn(async () => ({
    data: handlers.insertError ? null : { id: handlers.insertId ?? "inserted-id" },
    error: handlers.insertError ?? null,
  }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
  const upsert = vi.fn();

  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
    upsert,
    update,
    insert,
  }));

  return { from, upsert, update, insert, maybeSingle, updateEq };
}

describe("external identity regression (A–F)", () => {
  it("A: two providers may share the same external_id under different sources", async () => {
    // Identity is (source, external_id) — upserts for different sources never collide on lookup.
    const ur = mockAdmin({ existingId: null, insertId: "evt-uri" });
    const ath = mockAdmin({ existingId: null, insertId: "evt-ath" });
    const a = await upsertBySourceExternalId(
      { from: ur.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "123", title: "Club" },
    );
    const b = await upsertBySourceExternalId(
      { from: ath.from } as never,
      "external_events",
      { source: "athletics", external_id: "123", title: "Game" },
    );
    expect(a.id).toBe("evt-uri");
    expect(b.id).toBe("evt-ath");
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
  });

  it("B: importing the same (source, external_id) twice updates rather than duplicates", async () => {
    const admin = mockAdmin({ existingId: "evt-1" });
    const first = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "123", title: "Once" },
    );
    const second = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "123", title: "Twice" },
    );
    expect(first.id).toBe("evt-1");
    expect(second.id).toBe("evt-1");
    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.update).toHaveBeenCalled();
  });

  it("C: retrying a provider sync is idempotent (no ON CONFLICT upsert path)", async () => {
    const admin = mockAdmin({ existingId: "evt-keep" });
    await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "athletics", external_id: "game-9", title: "Retry" },
    );
    expect(admin.upsert).not.toHaveBeenCalled();
    expect(EXTERNAL_SOURCE_ID_CONFLICT).toBe("source,external_id");
  });

  it("D: structural schema errors surface as a single EVENT_SCHEMA_INCOMPATIBLE diagnostic", () => {
    const formatted = formatSourceExternalIdConflictError(
      "external_events",
      "1",
      "there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
    expect(formatted).toContain("EVENT_SCHEMA_INCOMPATIBLE");
    expect(isMissingOnConflictTargetError({ code: "42P10", message: "ON CONFLICT" })).toBe(true);
    const summary = formatAdminSyncErrorSummary(SCHEMA_INCOMPATIBLE_DIAGNOSTIC);
    expect(summary.title).toMatch(/schema incompatible/i);
    expect(summary.summary).toMatch(/EVENT_SCHEMA_INCOMPATIBLE/);
  });

  it("E: Athletics identity remains source-scoped (migration preserves composite unique)", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20260905190000_external_events_identity_invariant.sql"),
      "utf8",
    );
    expect(migration).toContain("external_events_source_external_id_key");
    expect(migration).toContain("UNIQUE (source, external_id)");
    expect(migration).toMatch(/partition by source, external_id/i);
    // Must not reintroduce global UNIQUE(external_id) only.
    expect(migration).not.toMatch(/add constraint external_events_external_id_key unique \(external_id\)/i);
  });

  it("F: URInvolved / Athletics importers use select→update/insert keyed by source+external_id", () => {
    const uriSync = readFileSync(join(root, "lib/server/urinvolved/sync.ts"), "utf8");
    const athSync = readFileSync(join(root, "lib/server/eventSources/athleticsSync.ts"), "utf8");
    const upsert = readFileSync(join(root, "lib/server/eventSources/upsertBySourceExternalId.ts"), "utf8");
    expect(uriSync).toContain("assertExternalIdentitySchemaReady");
    expect(athSync).toContain("assertExternalIdentitySchemaReady");
    expect(uriSync).toContain("isStructuralSyncFailure");
    expect(athSync).toContain("isStructuralSyncFailure");
    expect(upsert).toContain('.eq("source", source)');
    expect(upsert).toContain('.eq("external_id", externalId)');
    expect(upsert).not.toMatch(/\.upsert\(/);
  });
});
