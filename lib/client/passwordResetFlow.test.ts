import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_PATH } from "@/lib/authRedirect";
import {
  hasRecoveryCredentials,
  httpsPasswordResetFromNativeUrl,
  recoverySessionPlan,
  inAppAuthUrlFromOpenUrl,
  isPasswordRecoveryCallback,
  isPasswordResetPath,
  nativePasswordResetHandoffUrl,
  passwordResetFormError,
  passwordResetLinkFailure,
  shouldHoldRecoverySession,
  shouldOfferNativePasswordResetHandoff,
  supabaseAuthOptionsForPath,
} from "@/lib/client/passwordResetFlow";

const STRONG = "Campus1!";

describe("password reset session gate", () => {
  it("does not persist a recovery session as an app login", () => {
    expect(supabaseAuthOptionsForPath(PASSWORD_RESET_PATH, "?code=abc")).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    expect(supabaseAuthOptionsForPath("/auth/callback", "?type=recovery&code=abc")).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    expect(supabaseAuthOptionsForPath("/auth/callback", "?code=signup")).toMatchObject({
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    });
    expect(supabaseAuthOptionsForPath("/")).toMatchObject({ persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
    expect(shouldHoldRecoverySession(true, PASSWORD_RESET_PATH)).toBe("hold");
    expect(shouldHoldRecoverySession(true, "/auth/callback")).toBe("hold");
    expect(shouldHoldRecoverySession(true, "/")).toBe("release");
    expect(shouldHoldRecoverySession(false, PASSWORD_RESET_PATH)).toBe("ignore");
    expect(hasRecoveryCredentials({ code: "abc" })).toBe(true);
    expect(hasRecoveryCredentials({ access_token: "a", refresh_token: "b" })).toBe(true);
    expect(hasRecoveryCredentials({})).toBe(false);
    expect(recoverySessionPlan({ access_token: "a", refresh_token: "b" })).toBe("tokens");
    expect(recoverySessionPlan({ code: "abc" })).toBe("code");
    expect(recoverySessionPlan({})).toBe("existing");
    expect(recoverySessionPlan({ access_token: "a" })).toBe("existing");
    expect(isPasswordResetPath("/auth/reset-password")).toBe(true);
    expect(isPasswordResetPath("/auth/callback")).toBe(false);
  });

  it("recognizes a recovery callback without treating it as a finished login", () => {
    expect(isPasswordRecoveryCallback({ type: "recovery", code: "abc" })).toBe(true);
    expect(isPasswordRecoveryCallback({ type: "signup", code: "abc" })).toBe(false);
  });
});

describe("password reset form", () => {
  it("requires the existing password rules and a matching confirmation", () => {
    expect(passwordResetFormError("short", "short")).toMatch(/requirement/);
    expect(passwordResetFormError(STRONG, "Campus2!")).toMatch(/same password/);
    expect(passwordResetFormError(STRONG, STRONG)).toBeNull();
  });

  it("explains expired and already-used links", () => {
    expect(passwordResetLinkFailure({ error_code: "otp_expired" })).toMatch(/expired/);
    expect(passwordResetLinkFailure({ error: "access_denied" })).toMatch(/no longer valid/);
    expect(passwordResetLinkFailure({ code: "fresh" })).toBeNull();
  });
});

describe("native reset links", () => {
  it("maps the app scheme onto the reset screen and ignores other links", () => {
    expect(
      httpsPasswordResetFromNativeUrl(
        "campusquest://auth/reset-password?code=abc",
        "https://campusquestapp.com",
      ),
    ).toBe("https://campusquestapp.com/auth/reset-password?code=abc");
    expect(httpsPasswordResetFromNativeUrl("https://campusquestapp.com/auth/callback", "https://campusquestapp.com")).toBeNull();
    expect(
      inAppAuthUrlFromOpenUrl(
        "https://campusquestapp.com/auth/reset-password?code=abc",
        "https://campusquestapp.com",
      ),
    ).toBe("https://campusquestapp.com/auth/reset-password?code=abc");
    expect(
      inAppAuthUrlFromOpenUrl("https://campusquestapp.com/auth/callback?code=abc", "https://campusquestapp.com"),
    ).toBe("https://campusquestapp.com/auth/callback?code=abc");
    expect(inAppAuthUrlFromOpenUrl("https://campusquestapp.com/quad", "https://campusquestapp.com")).toBeNull();
    expect(nativePasswordResetHandoffUrl("?code=abc", "")).toBe("campusquest://auth/reset-password?code=abc");
    expect(
      shouldOfferNativePasswordResetHandoff({ userAgent: "Mozilla/5.0 (iPhone)", nativeApp: false }),
    ).toBe(true);
    expect(
      shouldOfferNativePasswordResetHandoff({ userAgent: "Mozilla/5.0 (iPhone)", nativeApp: true }),
    ).toBe(false);
    expect(
      shouldOfferNativePasswordResetHandoff({ userAgent: "Mozilla/5.0 (Macintosh)", nativeApp: false }),
    ).toBe(false);
  });
});

describe("auth and offer regressions", () => {
  it("keeps the one-time link intact until the new password is submitted", () => {
    const source = readFileSync(join(process.cwd(), "components/auth/ResetPasswordClient.tsx"), "utf8");
    const prepare = source.indexOf("async function prepare");
    const submit = source.indexOf("async function onSubmit");
    expect(prepare).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(prepare);
    expect(source.slice(prepare, submit)).not.toContain("exchangeCodeForSession");
    expect(source.slice(prepare, submit)).not.toContain("setSession");
    expect(source.slice(submit)).toContain("establishRecoverySession()");
    const establish = source.indexOf("async function establishRecoverySession");
    const plan = source.indexOf("recoverySessionPlan", establish);
    const existingSession = source.indexOf("getSession()", establish);
    expect(plan).toBeGreaterThan(establish);
    expect(existingSession).toBeGreaterThan(plan);
    expect(source).toContain("password.trim()");
    expect(source).toContain("!updated.user");
  });

  it("does not mirror a recovery session from the auth listener or callback", () => {
    const session = readFileSync(join(process.cwd(), "lib/client/supabaseSession.ts"), "utf8");
    const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    expect(session).toContain("shouldHoldRecoverySession");
    expect(session.indexOf("if (await blockPendingPasswordReset()) return")).toBeLessThan(
      session.indexOf("setAccessToken(session.access_token)"),
    );
    expect(middleware).toContain('matcher: ["/api/:path*"]');
    expect(middleware).not.toContain("/auth/reset-password");
  });

  it("sends recovery callbacks to the reset screen before exchanging the code", () => {
    const source = readFileSync(join(process.cwd(), "components/auth/AuthCallbackClient.tsx"), "utf8");
    const recovery = source.indexOf("isPasswordRecoveryCallback(params)");
    const exchange = source.indexOf("exchangeCodeForSession");
    expect(recovery).toBeGreaterThan(-1);
    expect(recovery).toBeLessThan(exchange);
    expect(source).toContain("PASSWORD_RESET_PATH");
  });

  it("keeps signup verification on the callback URL and password reset on its own URL", () => {
    const reset = readFileSync(join(process.cwd(), "app/api/auth/reset-password/route.ts"), "utf8");
    const signup = readFileSync(join(process.cwd(), "lib/server/resendStudentVerificationEmail.ts"), "utf8");
    expect(reset).toContain("getPasswordResetRedirectUrl");
    expect(reset).toContain("deliverPasswordResetEmail");
    expect(reset).not.toContain("getAuthEmailRedirectUrl");
    expect(signup).toContain("getAuthEmailRedirectUrl");
  });

  it("centers Make Offer in the dialog modal", () => {
    const source = readFileSync(join(process.cwd(), "components/market/MarketOfferSheet.tsx"), "utf8");
    expect(source).toContain('placement="dialog"');
    expect(source).toContain("cq-modal-body");
    expect(source).toContain("createMarketplaceOfferRequest");
  });

  it("previews a business logo locally and uploads it only on submit", () => {
    const verification = readFileSync(join(process.cwd(), "components/identity/VerificationOnboarding.tsx"), "utf8");
    const market = readFileSync(join(process.cwd(), "components/market/MarketCreateBusinessSheet.tsx"), "utf8");
    const picker = readFileSync(join(process.cwd(), "components/identity/BusinessLogoField.tsx"), "utf8");
    expect(picker).toContain("URL.createObjectURL");
    expect(picker).toContain("Replace logo");
    expect(picker).toContain("Remove");
    expect(verification).toContain("BusinessLogoField");
    expect(verification.indexOf("await uploadVerificationImage")).toBeGreaterThan(verification.indexOf("async function submit"));
    expect(verification).not.toContain("onPickFile");
    expect(market).toContain("BusinessLogoField");
    expect(market).toContain("uploadMarketplaceImage");
  });
});
