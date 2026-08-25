import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_CONSENT_VERSION, LEGAL_DOC_LINKS } from "@/lib/legal/policy";

describe("Data & Personalization Consent source contracts", () => {
  const authSrc = readFileSync(join(process.cwd(), "components/AuthScreen.tsx"), "utf8");
  const backSrc = readFileSync(join(process.cwd(), "components/LegalDocumentBackNav.tsx"), "utf8");
  const layoutSrc = readFileSync(join(process.cwd(), "app/legal/layout.tsx"), "utf8");
  const pageSrc = readFileSync(join(process.cwd(), "app/legal/data-consent/page.tsx"), "utf8");
  const statusSrc = readFileSync(join(process.cwd(), "lib/server/legalConsentStatus.ts"), "utf8");
  const servicesSrc = readFileSync(join(process.cwd(), "lib/server/services.ts"), "utf8");
  const supportSrc = readFileSync(join(process.cwd(), "app/support/page.tsx"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260825120000_legal_data_personalization_consent.sql",
  );

  it("uses one signup checkbox that links all three documents", () => {
    expect(authSrc).toContain("I agree to the ");
    expect(authSrc).toContain("Terms of Service");
    expect(authSrc).toContain("Privacy Policy");
    expect(authSrc).toContain("Data & Personalization Consent");
    expect(authSrc).toContain("LEGAL_DOC_LINKS.terms");
    expect(authSrc).toContain("LEGAL_DOC_LINKS.privacy");
    expect(authSrc).toContain("LEGAL_DOC_LINKS.dataConsent");
    expect(authSrc).toContain('htmlFor="auth-signup-agreement"');
    expect(authSrc).toContain("aria-labelledby=\"auth-signup-agreement-copy\"");
    expect(authSrc).toContain("Please accept the Terms of Service, Privacy Policy, and Data & Personalization Consent");
    expect(authSrc).toContain("writeAuthSignupDraft");
    expect(authSrc).toContain("readAuthSignupDraft");
  });

  it("renders the consent page in the shared legal layout with the existing back control", () => {
    expect(LEGAL_DOC_LINKS.dataConsent).toBe("/legal/data-consent");
    expect(pageSrc).toContain("Data & Personalization Consent");
    expect(pageSrc).toContain("Please read this before continuing.");
    expect(layoutSrc).toContain("LegalDocumentBackNav");
    expect(backSrc).toContain('aria-label="Back"');
    expect(backSrc).toContain("router.back()");
    expect(backSrc).toContain("ArrowLeft");
  });

  it("records data consent version and timestamp without gating existing users", () => {
    expect(DATA_CONSENT_VERSION).toBe("2026-08-25.1");
    expect(servicesSrc).toContain("accepted_data_consent: true");
    expect(servicesSrc).toContain("data_consent_version: DATA_CONSENT_VERSION");
    expect(servicesSrc).toContain("data_consented_at: nowIso");
    expect(statusSrc).toContain("acceptedTerms && acceptedPrivacyPolicy && acceptedGuidelines");
    expect(statusSrc).not.toMatch(/agreementComplete = Boolean\(data\) && acceptedTerms && acceptedPrivacyPolicy && acceptedGuidelines && acceptedDataConsent/);
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("exposes the document from Settings/support", () => {
    expect(supportSrc).toContain("LEGAL_DOC_LINKS.dataConsent");
    expect(supportSrc).toContain("Data & Personalization Consent");
  });
});
