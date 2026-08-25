export const DEFAULT_POLICY_VERSION = "2026-08-11.1";

/** Independent of Terms/Privacy/Guidelines policy version; recorded on accept without forcing existing users to re-consent. */
export const DATA_CONSENT_VERSION = "2026-08-25.1";

export const LEGAL_DOC_LINKS = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  guidelines: "/legal/community-guidelines",
  dataConsent: "/legal/data-consent",
  support: "/support",
} as const;
