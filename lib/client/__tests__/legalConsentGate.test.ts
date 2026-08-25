import { describe, expect, it } from "vitest";
import { consentPayloadAllowsAppAccess, mustRedirectToAgreement } from "@/lib/client/agreementAccess";
import { isAccessTokenExpired } from "@/lib/client/accessTokenExpiry";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function jwtWithExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds }), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

describe("agreement access payload", () => {
  it("does not require data consent to keep existing users in the app", () => {
    const payload = {
      agreementComplete: true,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      acceptedGuidelines: true,
      acceptedDataConsent: false,
    };
    expect(consentPayloadAllowsAppAccess(payload)).toBe(true);
    expect(mustRedirectToAgreement(payload)).toBe(false);
  });

  it("still requires terms, privacy, and guidelines", () => {
    expect(
      consentPayloadAllowsAppAccess({
        acceptedTerms: true,
        acceptedPrivacyPolicy: true,
        acceptedGuidelines: false,
        acceptedDataConsent: true,
      }),
    ).toBe(false);
  });
});

describe("access token expiry", () => {
  it("treats past exp as expired and future exp as usable", () => {
    expect(isAccessTokenExpired(jwtWithExp(Math.floor(Date.now() / 1000) - 120))).toBe(true);
    expect(isAccessTokenExpired(jwtWithExp(Math.floor(Date.now() / 1000) + 3600))).toBe(false);
    expect(isAccessTokenExpired(null)).toBe(true);
  });
});

describe("agreement gate client wiring", () => {
  const flowSrc = readFileSync(join(process.cwd(), "components/AgreementFlow.tsx"), "utf8");
  const dashboardSrc = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
  const clientSrc = readFileSync(join(process.cwd(), "lib/client/legalConsentClient.ts"), "utf8");

  it("does not render the agreement form while status is loading or failed", () => {
    expect(flowSrc).toContain('phase === "temporary_error"');
    expect(flowSrc).toContain("Try Again");
    expect(flowSrc).toContain("Sign Out");
    expect(flowSrc).toContain("loadLegalConsentGate");
    expect(flowSrc).not.toMatch(/setPhase\("consent"\);\s*\} catch/);
  });

  it("keeps Dashboard from treating query failures as unsigned-in consent required", () => {
    expect(dashboardSrc).toContain("loadLegalConsentGate");
    expect(dashboardSrc).toContain('consentGate.kind === "temporary_error"');
    expect(dashboardSrc).not.toContain("mustRedirectToAgreement(consentJson.data)");
  });

  it("refreshes an expired session at most once", () => {
    expect(clientSrc).toContain("refreshClientSession");
    expect(clientSrc).toContain("refreshAttempted");
    expect(clientSrc).toContain("AGREEMENT_ERROR_CODES.AUTH_INVALID");
  });
});
