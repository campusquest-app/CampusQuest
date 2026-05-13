/**
 * When opening a legal document from {@link LegalConsentScreen} (same-tab), we store intent so `/` can restore
 * the consent/onboarding gate after router.back/push fallback.
 */

export const LEGAL_CONSENT_RESUME_SESSION_KEY = "cq_resume_after_legal_review_v1";

export function armLegalConsentResumeFromGate(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LEGAL_CONSENT_RESUME_SESSION_KEY, "1");
  } catch {
    // ignore quota / blocked storage (legal back still navigates via history or / route)
  }
}

export function peekLegalConsentResumeGateArmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(LEGAL_CONSENT_RESUME_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function takeLegalConsentResumeToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = sessionStorage.getItem(LEGAL_CONSENT_RESUME_SESSION_KEY);
    if (v !== "1") return false;
    sessionStorage.removeItem(LEGAL_CONSENT_RESUME_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
