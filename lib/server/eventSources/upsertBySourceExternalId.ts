/**
 * Shared upsert helpers for external_events / external_organizations.
 *
 * Identity is always (source, external_id). Uses select → update/insert only —
 * never PostgREST ON CONFLICT — so sync cannot fail with Postgres 42P10 when
 * the API schema cache lags behind migrations.
 */

import type { createAdminClient } from "@/lib/server/supabase";
import {
  SCHEMA_INCOMPATIBLE_DIAGNOSTIC,
  isStructuralSyncFailure,
} from "@/lib/server/eventSources/schemaHealth";

type AdminClient = ReturnType<typeof createAdminClient>;

export const EXTERNAL_SOURCE_ID_CONFLICT = "source,external_id" as const;

export function isMissingOnConflictTargetError(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42P10") return true;
  return /no unique or exclusion constraint matching the ON CONFLICT/i.test(error.message ?? "");
}

export function formatSourceExternalIdConflictError(
  table: "external_events" | "external_organizations",
  externalId: string,
  cause: string,
): string {
  const label = table === "external_organizations" ? "Org" : "Event";
  if (isMissingOnConflictTargetError({ message: cause }) || isStructuralSyncFailure(cause)) {
    return `${SCHEMA_INCOMPATIBLE_DIAGNOSTIC} (${table} / ${label} ${externalId})`;
  }
  return `${label} ${externalId} [${table} identity ${EXTERNAL_SOURCE_ID_CONFLICT}]: ${cause}`;
}

export type UpsertBySourceExternalIdResult = {
  id: string | null;
  created: boolean;
  usedFallback: boolean;
};

/**
 * Upsert a row keyed by (source, external_id).
 * `row` must include string `source` and `external_id`.
 */
export async function upsertBySourceExternalId(
  admin: AdminClient,
  table: "external_events" | "external_organizations",
  row: Record<string, unknown> & { source: string; external_id: string },
  options?: { selectId?: boolean },
): Promise<UpsertBySourceExternalIdResult> {
  void options;
  const source = String(row.source).trim();
  const externalId = String(row.external_id).trim();
  if (!source || !externalId) {
    throw new Error(
      formatSourceExternalIdConflictError(table, externalId || "(empty)", "source and external_id are required"),
    );
  }
  const payload = { ...row, source, external_id: externalId };

  const existingQuery = await admin
    .from(table)
    .select("id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existingQuery.error) {
    throw new Error(
      formatSourceExternalIdConflictError(table, externalId, existingQuery.error.message),
    );
  }
  const existingId = (existingQuery.data as { id?: string } | null)?.id ?? null;

  if (existingId) {
    const { error: updateError } = await admin.from(table).update(payload).eq("id", existingId);
    if (updateError) {
      throw new Error(formatSourceExternalIdConflictError(table, externalId, updateError.message));
    }
    return { id: existingId, created: false, usedFallback: true };
  }

  const { data: inserted, error: insertError } = await admin
    .from(table)
    .insert(payload)
    .select("id")
    .single();

  if (!insertError && inserted) {
    return {
      id: String((inserted as { id: string }).id),
      created: true,
      usedFallback: true,
    };
  }

  // Race: another writer inserted the same (source, external_id). Update that row.
  if (insertError && (insertError.code === "23505" || /duplicate key/i.test(insertError.message))) {
    const again = await admin
      .from(table)
      .select("id")
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();
    const racedId = (again.data as { id?: string } | null)?.id ?? null;
    if (racedId) {
      const { error: updateError } = await admin.from(table).update(payload).eq("id", racedId);
      if (updateError) {
        throw new Error(formatSourceExternalIdConflictError(table, externalId, updateError.message));
      }
      return { id: racedId, created: false, usedFallback: true };
    }
  }

  throw new Error(
    formatSourceExternalIdConflictError(
      table,
      externalId,
      insertError?.message ?? "Could not insert or update row.",
    ),
  );
}
