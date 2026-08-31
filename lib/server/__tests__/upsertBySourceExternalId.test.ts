import { describe, expect, it, vi } from "vitest";
import { upsertBySourceExternalId } from "@/lib/server/eventSources/upsertBySourceExternalId";

function mockAdmin(handlers: {
  existingId?: string | null;
  upsertError?: { message: string; code?: string } | null;
  updateError?: { message: string } | null;
  insertId?: string;
}) {
  const maybeSingle = vi.fn(async () => ({
    data: handlers.existingId ? { id: handlers.existingId } : null,
    error: null,
  }));
  const single = vi.fn(async () => {
    if (handlers.upsertError) return { data: null, error: handlers.upsertError };
    return { data: { id: handlers.existingId ?? handlers.insertId ?? "new-id" }, error: null };
  });
  const upsert = vi.fn(() => ({ select: () => ({ single }) }));
  const updateEq = vi.fn(async () => ({ error: handlers.updateError ?? null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const insertSingle = vi.fn(async () => ({
    data: { id: handlers.insertId ?? "inserted-id" },
    error: null,
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

  return { from, upsert, update, insert, maybeSingle };
}

describe("upsertBySourceExternalId", () => {
  it("updates existing organizations without duplicating", async () => {
    const admin = mockAdmin({ existingId: "org-1" });
    const result = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_organizations",
      { source: "urinvolved", external_id: "379938", name: "Test Org" },
      { selectId: true },
    );
    expect(result).toEqual({ id: "org-1", created: false, usedFallback: false });
    expect(admin.upsert).toHaveBeenCalled();
  });

  it("falls back to update/insert when ON CONFLICT target is missing", async () => {
    const admin = mockAdmin({
      existingId: "evt-1",
      upsertError: {
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      },
    });
    const result = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "12628696", title: "Campus Event" },
      { selectId: true },
    );
    expect(result.usedFallback).toBe(true);
    expect(result.created).toBe(false);
    expect(result.id).toBe("evt-1");
    expect(admin.update).toHaveBeenCalled();
  });

  it("inserts when no existing row and conflict target is missing", async () => {
    const admin = mockAdmin({
      existingId: null,
      upsertError: {
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      },
      insertId: "evt-new",
    });
    const result = await upsertBySourceExternalId(
      { from: admin.from } as never,
      "external_events",
      { source: "urinvolved", external_id: "999", title: "New Event" },
      { selectId: true },
    );
    expect(result).toEqual({ id: "evt-new", created: true, usedFallback: true });
    expect(admin.insert).toHaveBeenCalled();
  });
});
