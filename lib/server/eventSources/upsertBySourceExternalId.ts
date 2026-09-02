/**
 * Shared upsert helpers for external_events / external_organizations.
 *
 * Identity is always (source, external_id). Prefer select → update/insert so sync
 * never depends on PostgREST ON CONFLICT matching a unique constraint (42P10).
 * A best-effort upsert remains as a secondary path when no existing row is found.
 */

import type { createAdminClient } from "@/lib/server/supabase";

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
  return `${label} ${externalId} [${table} conflict target ${EXTERNAL_SOURCE_ID_CONFLICT}]: ${cause}`;
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
  const source = String(row.source);
  const externalId = String(row.external_id);
  const payload = { ...row, source, external_id: externalId };
  const selectId = options?.selectId !== false;

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

  // Primary path: update/insert by identity lookup — never requires ON CONFLICT.
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

  // Last resort: PostgREST upsert on the composite unique target (requires migration).
  if (selectId) {
    const { data, error } = await admin
      .from(table)
      .upsert(payload, { onConflict: EXTERNAL_SOURCE_ID_CONFLICT })
      .select("id")
      .single();
    if (!error && data) {
      return {
        id: String((data as { id: string }).id),
        created: true,
        usedFallback: false,
      };
    }
    if (error && !isMissingOnConflictTargetError(error)) {
      throw new Error(formatSourceExternalIdConflictError(table, externalId, error.message));
    }
    if (error) {
      throw new Error(
        formatSourceExternalIdConflictError(
          table,
          externalId,
          insertError?.message ?? error.message,
        ),
      );
    }
  } else {
    const { error } = await admin.from(table).upsert(payload, { onConflict: EXTERNAL_SOURCE_ID_CONFLICT });
    if (!error) {
      return { id: null, created: true, usedFallback: false };
    }
    if (!isMissingOnConflictTargetError(error)) {
      throw new Error(formatSourceExternalIdConflictError(table, externalId, error.message));
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
