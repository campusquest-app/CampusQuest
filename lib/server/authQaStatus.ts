import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getMissingSupabaseEnvVarNames } from "@/lib/server/authBootstrap";
import { describeAuthRedirectConfig } from "@/lib/authRedirect";
import { AUTH_RESEND_COOLDOWN_MS, AUTH_RESEND_SERVER_LIMIT } from "@/lib/authEmailDelivery";
import { ONBOARDING_QA_EMAIL } from "@/lib/onboardingQa";
import { listApprovedQaSignupEmails } from "@/lib/signupEmailPolicy";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";

function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Non-secret auth pipeline status for the admin QA panel. */
export function buildAuthQaStatus() {
  const missing = getMissingSupabaseEnvVarNames();
  const redirects = describeAuthRedirectConfig();
  const pilot = getPilotSchoolConfig();
  return {
    requireEmailVerification: FEATURE_FLAGS.requireEmailVerification,
    supabase: {
      configured: missing.length === 0,
      urlHost: hostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      missingEnvNames: missing,
    },
    emailProvider: {
      integration: "Supabase Auth sends mail through the project's SMTP provider (Resend when configured in Supabase).",
      smtpConfiguredInApp: false,
      note: "SMTP credentials live in the Supabase project, not in CampusQuest. This panel never returns keys or passwords.",
    },
    redirects,
    resend: {
      clientCooldownMs: AUTH_RESEND_COOLDOWN_MS,
      serverLimitPerWindow: AUTH_RESEND_SERVER_LIMIT,
      serverWindowMinutes: 15,
    },
    signup: {
      pilotSchoolName: pilot.schoolName,
      pilotDomain: pilot.schoolDomain,
      approvedQaSignupEmails: listApprovedQaSignupEmails(),
    },
    onboardingQa: {
      email: ONBOARDING_QA_EMAIL,
      mode: "session-level replay — does not reset XP, admin role, or account data",
      verificationCycle:
        "Allowlisted self-only cycle: unconfirm Auth email → one Resend via Supabase SMTP → real /auth/callback",
    },
  };
}
