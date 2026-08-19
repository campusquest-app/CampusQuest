/**
 * Small-cohort suppression for university-facing aggregate analytics.
 * Never display a demographic cohort breakdown with fewer than this many unique students.
 */
export const ANALYTICS_COHORT_MIN_UNIQUE = 5;

export type SuppressibleCohort = {
  key: string;
  label: string;
  uniqueStudents: number;
  /** Optional secondary count (e.g. posts, RSVPs). */
  totalEvents?: number;
};

export type PublicCohortRow = {
  key: string;
  label: string;
  uniqueStudents: number | null;
  totalEvents: number | null;
  suppressed: boolean;
  displayLabel: string;
};

export function suppressSmallCohorts(
  rows: SuppressibleCohort[],
  minUnique: number = ANALYTICS_COHORT_MIN_UNIQUE,
): PublicCohortRow[] {
  return rows.map((row) => {
    if (row.uniqueStudents < minUnique) {
      return {
        key: row.key,
        label: row.label,
        uniqueStudents: null,
        totalEvents: null,
        suppressed: true,
        displayLabel: `<${minUnique} students`,
      };
    }
    return {
      key: row.key,
      label: row.label,
      uniqueStudents: row.uniqueStudents,
      totalEvents: row.totalEvents ?? null,
      suppressed: false,
      displayLabel: row.label,
    };
  });
}
