/**
 * Preflight + error classification for external event/org sync.
 * Structural schema mismatches must abort once — never fan out per-record.
 */

import type { createAdminClient } from "@/lib/server/supabase";

type AdminClient = ReturnType<typeof createAdminClient>;

export const EVENT_SCHEMA_INCOMPATIBLE_CODE = "EVENT_SCHEMA_INCOMPATIBLE" as const;
export const EXTERNAL_IDENTITY_CONFLICT_COLS = "source, external_id" as const;
/** Migration that installs cq_external_identity_schema_health + named unique constraints. */
export const EXTERNAL_IDENTITY_INVARIANT_MIGRATION =
  "20260905190000_external_events_identity_invariant" as const;

export type SyncFailureClass =
  | "schema"
  | "provider"
  | "record"
  | "temporary_db"
  | "unknown";

export type ExternalIdentitySchemaHealth = {
  ok: boolean;
  code: string | null;
  message: string;
  external_events_unique_source_external_id: boolean;
  external_organizations_unique_source_external_id: boolean;
  required_constraint: string;
  events_constraint_name: string;
  organizations_constraint_name: string;
};

export const SCHEMA_INCOMPATIBLE_DIAGNOSTIC =
  `${EVENT_SCHEMA_INCOMPATIBLE_CODE}: external_events requires UNIQUE(${EXTERNAL_IDENTITY_CONFLICT_COLS})`;

export function classifySyncFailure(message: string): SyncFailureClass {
  const text = message ?? "";
  if (
    text.includes(EVENT_SCHEMA_INCOMPATIBLE_CODE) ||
    /no unique or exclusion constraint matching the ON CONFLICT/i.test(text) ||
    /42P10/.test(text)
  ) {
    return "schema";
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|HTTP\s*[45]\d\d|rate limit|network/i.test(text)) {
    return "provider";
  }
  if (/deadlock|could not serialize|connection terminated|timeout|57014|40001|40P01/i.test(text)) {
    return "temporary_db";
  }
  if (/^Event\s+/i.test(text) || /^Org\s+/i.test(text) || /malformed|could not be parsed|invalid/i.test(text)) {
    return "record";
  }
  return "unknown";
}

export function isStructuralSyncFailure(message: string): boolean {
  const kind = classifySyncFailure(message);
  return kind === "schema" || kind === "temporary_db";
}

export async function assertExternalIdentitySchemaReady(admin: AdminClient): Promise<ExternalIdentitySchemaHealth> {
  const { data, error } = await admin.rpc("cq_external_identity_schema_health");
  if (error) {
    // Function missing → migration not applied.
    if (/could not find the function|PGRST202|42883/i.test(error.message)) {
      throw new Error(
        `${SCHEMA_INCOMPATIBLE_DIAGNOSTIC} (health RPC missing — apply migration ${EXTERNAL_IDENTITY_INVARIANT_MIGRATION})`,
      );
    }
    throw new Error(`${SCHEMA_INCOMPATIBLE_DIAGNOSTIC} (health check failed: ${error.message})`);
  }

  const health = (data ?? {}) as Partial<ExternalIdentitySchemaHealth>;
  const normalized: ExternalIdentitySchemaHealth = {
    ok: Boolean(health.ok),
    code: (health.code as string | null) ?? null,
    message: String(health.message ?? SCHEMA_INCOMPATIBLE_DIAGNOSTIC),
    external_events_unique_source_external_id: Boolean(health.external_events_unique_source_external_id),
    external_organizations_unique_source_external_id: Boolean(
      health.external_organizations_unique_source_external_id,
    ),
    required_constraint: String(health.required_constraint ?? `UNIQUE (${EXTERNAL_IDENTITY_CONFLICT_COLS})`),
    events_constraint_name: String(health.events_constraint_name ?? "external_events_source_external_id_key"),
    organizations_constraint_name: String(
      health.organizations_constraint_name ?? "external_organizations_source_external_id_key",
    ),
  };

  if (!normalized.ok) {
    throw new Error(
      `${SCHEMA_INCOMPATIBLE_DIAGNOSTIC} — events=${normalized.external_events_unique_source_external_id} orgs=${normalized.external_organizations_unique_source_external_id}`,
    );
  }
  return normalized;
}

/** Non-throwing probe for admin Event Sources / health dashboards. */
export async function probeExternalIdentitySchemaHealth(
  admin: AdminClient,
): Promise<ExternalIdentitySchemaHealth> {
  try {
    return await assertExternalIdentitySchemaReady(admin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: EVENT_SCHEMA_INCOMPATIBLE_CODE,
      message,
      external_events_unique_source_external_id: false,
      external_organizations_unique_source_external_id: false,
      required_constraint: `UNIQUE (${EXTERNAL_IDENTITY_CONFLICT_COLS})`,
      events_constraint_name: "external_events_source_external_id_key",
      organizations_constraint_name: "external_organizations_source_external_id_key",
    };
  }
}
