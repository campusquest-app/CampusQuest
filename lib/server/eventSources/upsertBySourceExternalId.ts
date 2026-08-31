/**
 * Shared upsert helpers for external_events / external_organizations.
 * Always conflict on (source, external_id). Falls back to select→update/insert
 * if Postgres rejects ON CONFLICT (schema drift / stale deploy), so one mismatch
 * cannot wipe an entire provider sync.
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
    throw new Error(existingQuery.error.message);
  }
  const existingId = (existingQuery.data as { id?: string } | null)?.id ?? null;

  if (selectId) {
    const { data, error } = await admin
      .from(table)
      .upsert(payload, { onConflict: EXTERNAL_SOURCE_ID_CONFLICT })
      .select("id")
      .single();
    if (!error && data) {
      return {
        id: String((data as { id: string }).id),
        created: !existingId,
        usedFallback: false,
      };
    }
    if (error && !isMissingOnConflictTargetError(error)) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await admin.from(table).upsert(payload, { onConflict: EXTERNAL_SOURCE_ID_CONFLICT });
    if (!error) {
      return { id: existingId, created: !existingId, usedFallback: false };
    }
    if (!isMissingOnConflictTargetError(error)) {
      throw new Error(error.message);
    }
  }

  // Fallback when ON CONFLICT target is missing (or select-after-upsert failed for that reason).
  if (existingId) {
    const { error: updateError } = await admin.from(table).update(payload).eq("id", existingId);
    if (updateError) throw new Error(updateError.message);
    return { id: existingId, created: false, usedFallback: true };
  }

  const { data: inserted, error: insertError } = await admin
    .from(table)
    .insert(payload)
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? `Could not insert ${table} row.`);
  }
  return { id: String((inserted as { id: string }).id), created: true, usedFallback: true };
}
