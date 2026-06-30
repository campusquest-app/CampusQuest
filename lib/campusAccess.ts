/**
 * Campus feature eligibility — shared client/server logic.
 * Platform admins always bypass pilot school domain requirements.
 */

export type CampusVerificationSnapshot = {
  status: "pending" | "verified";
  schoolName: string | null;
  schoolDomain: string | null;
  requiredPilotDomain?: string | null;
};

export function isEmailVerifiedForCampus(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

export function extractCampusEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= email.length - 1) return null;
  const domain = email.slice(atIndex + 1).trim().toLowerCase().replace(/^@+/, "");
  return domain || null;
}

export function emailMatchesPilotDomain(
  email: string | null | undefined,
  pilotDomain: string | null | undefined,
): boolean {
  if (!pilotDomain) return false;
  const domain = extractCampusEmailDomain(email);
  if (!domain) return false;
  const normalizedPilot = pilotDomain.trim().toLowerCase().replace(/^@+/, "");
  return domain === normalizedPilot;
}

/**
 * Single gate for campus pilot features (Quad, orgs, events, map, etc.).
 * Platform admins bypass domain checks; students need verified pilot-school email.
 */
export function canAccessCampusFeatures(args: {
  isPlatformAdmin: boolean;
  email?: string | null;
  emailVerified: boolean;
  pilotDomain?: string | null;
  verification?: CampusVerificationSnapshot | null;
}): boolean {
  if (args.isPlatformAdmin) return true;

  const verification = args.verification;
  if (verification) {
    return (
      verification.status === "verified" &&
      Boolean(verification.schoolDomain) &&
      Boolean(verification.schoolName)
    );
  }

  return (
    args.emailVerified &&
    emailMatchesPilotDomain(args.email, args.pilotDomain ?? null)
  );
}
