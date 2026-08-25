/**
 * Graduation year is the source of truth.
 * Class standing is derived from the current academic year (URI-style fall start).
 */

export type ClassStandingId =
  | "freshman"
  | "sophomore"
  | "junior"
  | "senior"
  | "graduate"
  | "other";

/** Academic year start: Aug 1 in America/New_York. */
export function currentAcademicYearStart(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  // Before August → still previous academic year's spring term
  return month >= 8 ? year : year - 1;
}

/**
 * Expected 4-year cohort graduation years for the current cycle.
 * Example (academic year starting 2026): Senior→2027 … Freshman→2030
 */
export function graduationYearOptions(now: Date = new Date()): Array<{
  year: number | null;
  standing: ClassStandingId;
  label: string;
}> {
  const start = currentAcademicYearStart(now);
  const seniorYear = start + 1;
  return [
    { year: seniorYear + 3, standing: "freshman", label: `${seniorYear + 3}` },
    { year: seniorYear + 2, standing: "sophomore", label: `${seniorYear + 2}` },
    { year: seniorYear + 1, standing: "junior", label: `${seniorYear + 1}` },
    { year: seniorYear, standing: "senior", label: `${seniorYear}` },
    { year: null, standing: "other", label: "Not sure / Other" },
  ];
}

export function deriveClassStanding(
  graduationYear: number | null | undefined,
  now: Date = new Date(),
): ClassStandingId {
  if (graduationYear == null || !Number.isFinite(graduationYear)) return "other";
  const seniorYear = currentAcademicYearStart(now) + 1;
  const delta = graduationYear - seniorYear;
  if (delta === 3) return "freshman";
  if (delta === 2) return "sophomore";
  if (delta === 1) return "junior";
  if (delta === 0) return "senior";
  if (delta < 0) return "graduate";
  return "other";
}

export function classStandingLabel(standing: ClassStandingId): string {
  switch (standing) {
    case "freshman":
      return "Freshman";
    case "sophomore":
      return "Sophomore";
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
    case "graduate":
      return "Graduate";
    default:
      return "Other";
  }
}
