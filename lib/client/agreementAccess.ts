/** Client-side guard aligned with GET /api/legal/consent/status (database-backed fields from Supabase). */

export type LegalConsentPayload = {
  agreementComplete?: boolean;
  acceptedCurrentVersion?: boolean;
  acceptedTerms?: boolean;
  acceptedPrivacyPolicy?: boolean;
  acceptedGuidelines?: boolean;
  acceptedDataConsent?: boolean;
};

export function consentPayloadAllowsAppAccess(data: LegalConsentPayload | undefined): boolean {
  if (!data) return false;
  if (data.agreementComplete === true) return true;
  return Boolean(data.acceptedTerms && data.acceptedPrivacyPolicy && data.acceptedGuidelines);
}

/** If true, caller should `router.replace("/agreement")` — terms & privacy policy must be accepted per DB row for the active policy. */
export function mustRedirectToAgreement(data: LegalConsentPayload | undefined): boolean {
  return !consentPayloadAllowsAppAccess(data);
}
