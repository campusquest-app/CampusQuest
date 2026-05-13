export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, "");
}

export function getPilotSchoolConfig() {
  const schoolName = (process.env.PILOT_SCHOOL_NAME ?? "University of Rhode Island").trim();
  const schoolDomain = normalizeDomain(process.env.PILOT_SCHOOL_DOMAIN ?? "uri.edu");
  return {
    schoolName,
    schoolDomain,
  };
}

export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= email.length - 1) return null;
  return normalizeDomain(email.slice(atIndex + 1));
}
