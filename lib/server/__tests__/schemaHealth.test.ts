import { describe, expect, it, vi } from "vitest";
import {
  EVENT_SCHEMA_INCOMPATIBLE_CODE,
  SCHEMA_INCOMPATIBLE_DIAGNOSTIC,
  assertExternalIdentitySchemaReady,
  classifySyncFailure,
  isStructuralSyncFailure,
} from "@/lib/server/eventSources/schemaHealth";

describe("classifySyncFailure", () => {
  it("classifies missing ON CONFLICT / 42P10 as schema", () => {
    expect(
      classifySyncFailure("there is no unique or exclusion constraint matching the ON CONFLICT specification"),
    ).toBe("schema");
    expect(classifySyncFailure("42P10 something")).toBe("schema");
    expect(classifySyncFailure(SCHEMA_INCOMPATIBLE_DIAGNOSTIC)).toBe("schema");
  });

  it("classifies provider and record failures separately", () => {
    expect(classifySyncFailure("fetch failed")).toBe("provider");
    expect(classifySyncFailure("Event 123: malformed title")).toBe("record");
    expect(classifySyncFailure("deadlock detected")).toBe("temporary_db");
  });

  it("treats schema and temporary_db as structural (abort sync)", () => {
    expect(isStructuralSyncFailure(SCHEMA_INCOMPATIBLE_DIAGNOSTIC)).toBe(true);
    expect(isStructuralSyncFailure("Event 1: bad venue")).toBe(false);
  });
});

describe("assertExternalIdentitySchemaReady", () => {
  it("passes when RPC reports ok", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: null,
        message: "ok",
        external_events_unique_source_external_id: true,
        external_organizations_unique_source_external_id: true,
        required_constraint: "UNIQUE (source, external_id)",
        events_constraint_name: "external_events_source_external_id_key",
        organizations_constraint_name: "external_organizations_source_external_id_key",
      },
      error: null,
    }));
    await expect(assertExternalIdentitySchemaReady({ rpc } as never)).resolves.toMatchObject({ ok: true });
  });

  it("fails once with EVENT_SCHEMA_INCOMPATIBLE when constraints missing", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: false,
        code: EVENT_SCHEMA_INCOMPATIBLE_CODE,
        message: "missing",
        external_events_unique_source_external_id: false,
        external_organizations_unique_source_external_id: true,
        required_constraint: "UNIQUE (source, external_id)",
        events_constraint_name: "external_events_source_external_id_key",
        organizations_constraint_name: "external_organizations_source_external_id_key",
      },
      error: null,
    }));
    await expect(assertExternalIdentitySchemaReady({ rpc } as never)).rejects.toThrow(
      /EVENT_SCHEMA_INCOMPATIBLE/,
    );
  });

  it("fails clearly when health RPC is missing (migration not applied)", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Could not find the function public.cq_external_identity_schema_health" },
    }));
    await expect(assertExternalIdentitySchemaReady({ rpc } as never)).rejects.toThrow(
      /20260905190000_external_events_identity_invariant/,
    );
  });
});
