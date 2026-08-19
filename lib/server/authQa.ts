import { isKnownQaAccountEmail } from "@/lib/internalAccount";
import { isOnboardingQaEmail } from "@/lib/onboardingQa";
import { normalizeEmail } from "@/lib/platformAdmin";
import { emailMatchesPilotDomain } from "@/lib/campusAccess";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";

export function isAllowedAuthQaTargetEmail(args: {
  targetEmail: string;
  adminEmail: string;
}): boolean {
  const target = normalizeEmail(args.targetEmail);
  const admin = normalizeEmail(args.adminEmail);
  if (!target) return false;
  if (target === admin) return true;
  if (isOnboardingQaEmail(target)) return true;
  if (isKnownQaAccountEmail(target)) return true;
  const pilotDomain = getPilotSchoolConfig().schoolDomain;
  return emailMatchesPilotDomain(target, pilotDomain);
}

export function logAuthQa(phase: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" && process.env.AUTH_QA_LOG !== "1") return;
  console.info("[Auth QA]", phase, details ?? {});
}
