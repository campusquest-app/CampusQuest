import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_SIGNUP_DRAFT_KEY,
  clearAuthSignupDraft,
  readAuthSignupDraft,
  writeAuthSignupDraft,
} from "@/lib/client/authSignupDraft";
import { consentPayloadAllowsAppAccess, mustRedirectToAgreement } from "@/lib/client/agreementAccess";

describe("auth signup draft", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  function installMemoryStorage() {
    const map = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorage, configurable: true });
    return map;
  }

  it("round-trips signup fields including agreement state", () => {
    installMemoryStorage();
    writeAuthSignupDraft({
      mode: "signup",
      email: "ram@uri.edu",
      username: "ram",
      password: "Secret123!",
      confirmPassword: "Secret123!",
      acceptedTerms: true,
    });
    expect(readAuthSignupDraft()).toEqual({
      mode: "signup",
      email: "ram@uri.edu",
      username: "ram",
      password: "Secret123!",
      confirmPassword: "Secret123!",
      acceptedTerms: true,
    });
    clearAuthSignupDraft();
    expect(readAuthSignupDraft()).toBeNull();
  });

  it("ignores malformed stored drafts", () => {
    const map = installMemoryStorage();
    map.set(AUTH_SIGNUP_DRAFT_KEY, "{not-json");
    expect(readAuthSignupDraft()).toBeNull();
    map.set(AUTH_SIGNUP_DRAFT_KEY, JSON.stringify({ mode: "signup" }));
    expect(readAuthSignupDraft()).toBeNull();
  });
});

describe("legal agreement access", () => {
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

  it("still requires terms, privacy, and guidelines for the agreement gate", () => {
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
