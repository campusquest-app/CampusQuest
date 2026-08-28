/**
 * Optional onboarding discovery columns added in
 * 20260828120000_onboarding_discovery_profile.sql.
 * Required demographics (student_status, institution_id) stay strict.
 */

export const DISCOVERY_PROFILE_COLUMNS = [
  "academic_area",
  "requested_school_name",
  "requested_school_at",
  "realm_intro_completed_at",
] as const;

export type DiscoveryProfileColumn = (typeof DISCOVERY_PROFILE_COLUMNS)[number];

export function profileRowHasColumn(row: object, column: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, column);
}

export function isMissingDiscoveryColumnError(message?: string | null): boolean {
  return /academic_area|requested_school_name|requested_school_at|realm_intro_completed_at/i.test(
    message ?? "",
  );
}

/** Drop optional discovery fields that are not present on the live schema. */
export function omitUnavailableDiscoveryColumns(
  patch: Record<string, unknown>,
  existingRow: object,
): Record<string, unknown> {
  const next = { ...patch };
  for (const column of DISCOVERY_PROFILE_COLUMNS) {
    if (column in next && !profileRowHasColumn(existingRow, column)) {
      delete next[column];
    }
  }
  return next;
}

export function stripDiscoveryColumns(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch };
  for (const column of DISCOVERY_PROFILE_COLUMNS) {
    delete next[column];
  }
  return next;
}
