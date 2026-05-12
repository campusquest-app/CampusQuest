import { describe, expect, it } from "vitest";
import { ApiError } from "../http";
import { assertSafeMinutes, assertSafeXpGrant, enforceRateLimit } from "../security";

describe("security helpers", () => {
  it("allows safe xp grants", () => {
    expect(() => assertSafeXpGrant("activity", 120)).not.toThrow();
  });

  it("rejects unsafe xp grants", () => {
    expect(() => assertSafeXpGrant("activity", 9999)).toThrow(ApiError);
  });

  it("validates activity minutes", () => {
    expect(() => assertSafeMinutes(30)).not.toThrow();
    expect(() => assertSafeMinutes(0)).toThrow(ApiError);
  });

  it("enforces rate limiting", () => {
    const key = `test-${Date.now()}`;
    enforceRateLimit({ userId: key, routeKey: "test", limit: 2, windowMs: 10_000 });
    enforceRateLimit({ userId: key, routeKey: "test", limit: 2, windowMs: 10_000 });
    expect(() => enforceRateLimit({ userId: key, routeKey: "test", limit: 2, windowMs: 10_000 })).toThrow(ApiError);
  });
});

