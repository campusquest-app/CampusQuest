import { describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_SOURCE_ID_CONFLICT,
  formatSourceExternalIdConflictError,
  isMissingOnConflictTargetError,
  upsertBySourceExternalId,
} from "@/lib/server/eventSources/upsertBySourceExternalId";

function mockAdmin(handlers: {
  existingId?: string | null;
  secondLookupId?: string | null;
  updateError?: { message: string } | null;
  insertError?: { message: string; code?: string } | null;
  insertId?: string;
  upsertError?: { message: string; code?: string } | null;
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
  const single = vi.fn(async () => {
    if (handlers.upsertError) return { data: null, error: handlers.upsertError };
    return { data: { id: handlers.existingId ?? handlers.insertId ?? "new-id" }, error: null };
  });
  const upsert = vi.fn(() => ({ select: () => ({ single }) }));
  const updateEq = vi.fn(async () => ({ error: handlers.updateError ?? null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const insertSingle = vi.fn(async () => ({
    data: handlers.insertError ? null : { id: handlers.insertId ?? "inserted-id" },
    error: handlers.insertError ?? null,
  }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));

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

describe("upsertBySourceExternalId", () => {
  it("updates existing organizations without duplicating (idempotent)", async () => {
    const admin = mockAdmin({ existingId: "org-1" });
    const first = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_organizations",
      { source: "urinvolved", external_id: "379938", name: "Test Org" },
      { selectId: true },
    );
    expect(first).toEqual({ id: "org-1", created: false, usedFallback: true });
    expect(admin.update).toHaveBeenCalled();
    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it("inserts when no existing row", async () => {
    const admin = mockAdmin({ existingId: null, insertId: "evt-new" });
    const result = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "999", title: "New Event" },
      { selectId: true },
    );
    expect(result).toEqual({ id: "evt-new", created: true, usedFallback: true });
    expect(admin.insert).toHaveBeenCalled();
  });

  it("repeated sync of the same identity updates rather than inserts", async () => {
    const admin = mockAdmin({ existingId: "evt-1" });
    const a = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "12628696", title: "Campus Event" },
    );
    const b = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "12628696", title: "Campus Event Updated" },
    );
    expect(a.id).toBe("evt-1");
    expect(b.id).toBe("evt-1");
    expect(a.created).toBe(false);
    expect(b.created).toBe(false);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("handles insert race with duplicate key by updating existing row", async () => {
    const admin = mockAdmin({
      existingId: null,
      secondLookupId: "evt-raced",
      insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const result = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "42", title: "Raced" },
    );
    expect(result).toEqual({ id: "evt-raced", created: false, usedFallback: true });
    expect(admin.update).toHaveBeenCalled();
  });
});

describe("upsert conflict helpers", () => {
  it("uses the composite source,external_id conflict target", () => {
    expect(EXTERNAL_SOURCE_ID_CONFLICT).toBe("source,external_id");
  });

  it("detects missing ON CONFLICT target errors", () => {
    expect(
      isMissingOnConflictTargetError({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      }),
    ).toBe(true);
  });

  it("formats admin-facing errors with table and conflict target", () => {
    expect(
      formatSourceExternalIdConflictError(
        "external_organizations",
        "379938",
        "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      ),
    ).toBe(
      "Org 379938 [external_organizations conflict target source,external_id]: there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
  });
});
