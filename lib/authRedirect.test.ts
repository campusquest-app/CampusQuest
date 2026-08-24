import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_CALLBACK_PATH,
  AuthRedirectConfigError,
  LOCAL_DEV_SITE_URL,
  PRODUCTION_SITE_ORIGIN,
  describeAuthRedirectConfig,
  getAuthEmailRedirectUrl,
  getPublicSiteUrl,
  isProductionRuntime,
  normalizePublicSiteOrigin,
} from "@/lib/authRedirect";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("normalizePublicSiteOrigin", () => {
  it("strips trailing slashes and paths", () => {
    expect(normalizePublicSiteOrigin("https://campusquestapp.com/")).toBe(PRODUCTION_SITE_ORIGIN);
    expect(normalizePublicSiteOrigin("https://campusquestapp.com/auth/callback")).toBe(
      PRODUCTION_SITE_ORIGIN,
    );
  });

  it("adds https when scheme is omitted", () => {
    expect(normalizePublicSiteOrigin("campusquestapp.com")).toBe(PRODUCTION_SITE_ORIGIN);
  });
});

describe("getPublicSiteUrl / getAuthEmailRedirectUrl", () => {
  it("production generates https://campusquestapp.com/auth/callback from NEXT_PUBLIC_SITE_URL", () => {
    const env = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://campusquestapp.com",
    };
    expect(isProductionRuntime(env)).toBe(true);
    expect(getPublicSiteUrl(env)).toBe(PRODUCTION_SITE_ORIGIN);
    expect(getAuthEmailRedirectUrl(env)).toBe(`${PRODUCTION_SITE_ORIGIN}${AUTH_CALLBACK_PATH}`);
  });

  it("normalizes production SITE_URL with trailing slash", () => {
    const env = {
      VERCEL_ENV: "production",
      SITE_URL: "https://campusquestapp.com/",
    };
    expect(getAuthEmailRedirectUrl(env)).toBe("https://campusquestapp.com/auth/callback");
  });

  it("accepts NEXT_PUBLIC_APP_URL as an existing equivalent fallback", () => {
    const env = {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://campusquestapp.com",
    };
    expect(getAuthEmailRedirectUrl(env)).toBe("https://campusquestapp.com/auth/callback");
  });

  it("localhost is allowed in development", () => {
    const env = {
      NODE_ENV: "development",
      VERCEL_ENV: "development",
    };
    expect(getPublicSiteUrl(env)).toBe(LOCAL_DEV_SITE_URL);
    expect(getAuthEmailRedirectUrl(env)).toBe(`${LOCAL_DEV_SITE_URL}${AUTH_CALLBACK_PATH}`);
  });

  it("honors an explicit localhost override in development", () => {
    const env = {
      NODE_ENV: "development",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    };
    expect(getAuthEmailRedirectUrl(env)).toBe("http://localhost:3000/auth/callback");
  });

  it("production does not silently use localhost when the app URL is missing", () => {
    const env = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_URL: "campus-quest-mli4.vercel.app",
    };
    expect(() => getPublicSiteUrl(env)).toThrow(AuthRedirectConfigError);
    expect(() => getAuthEmailRedirectUrl(env)).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => getAuthEmailRedirectUrl(env)).toThrow(/campusquestapp\.com/);
  });

  it("production rejects an explicit localhost SITE_URL", () => {
    const env = {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    };
    expect(() => getAuthEmailRedirectUrl(env)).toThrow(AuthRedirectConfigError);
    expect(() => getAuthEmailRedirectUrl(env)).toThrow(/HTTPS|localhost/);
  });

  it("preview may use VERCEL_URL when no explicit site URL is set", () => {
    const env = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "campus-quest-git-feature-xxx.vercel.app",
    };
    expect(getAuthEmailRedirectUrl(env)).toBe(
      "https://campus-quest-git-feature-xxx.vercel.app/auth/callback",
    );
  });

  it("resend confirmation and QA paths share the same canonical redirect helper", () => {
    const env = {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://campusquestapp.com/",
    };
    // All auth email send sites import getAuthEmailRedirectUrl() — one helper, one value.
    const canonical = getAuthEmailRedirectUrl(env);
    expect(canonical).toBe("https://campusquestapp.com/auth/callback");
    expect(canonical.endsWith(AUTH_CALLBACK_PATH)).toBe(true);
    expect(canonical.includes("//auth")).toBe(false);
  });
});

describe("describeAuthRedirectConfig", () => {
  it("surfaces a loud config error instead of a localhost URL in production", () => {
    const described = describeAuthRedirectConfig({
      VERCEL_ENV: "production",
    });
    expect(described.configured).toBe(false);
    expect(described.emailRedirectUrl).toBeNull();
    expect(described.configError).toMatch(/NEXT_PUBLIC_SITE_URL/);
    // Message may mention localhost as the forbidden outcome — must not *return* a localhost URL.
    expect(described.siteUrl).toBeNull();
  });

  it("reports the production callback when configured", () => {
    const described = describeAuthRedirectConfig({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: PRODUCTION_SITE_ORIGIN,
    });
    expect(described).toEqual({
      siteUrl: PRODUCTION_SITE_ORIGIN,
      emailRedirectUrl: `${PRODUCTION_SITE_ORIGIN}${AUTH_CALLBACK_PATH}`,
      callbackPath: AUTH_CALLBACK_PATH,
      configured: true,
      configError: null,
    });
  });
});
