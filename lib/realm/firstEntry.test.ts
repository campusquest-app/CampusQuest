import { describe, expect, it } from "vitest";
import {
  campusArrivalName,
  readOptionalProfileTimestamp,
  shouldLandOnRealmFirstEntry,
  shouldShowNavHints,
  shouldShowRealmArrival,
} from "@/lib/realm/firstEntry";

describe("first-entry Realm welcome eligibility", () => {
  it("shows the arrival once for a brand-new completed account", () => {
    expect(
      shouldShowRealmArrival({
        realmWelcomeSeenAt: null,
        pending: true,
        onboardingComplete: true,
      }),
    ).toBe(true);
    expect(shouldLandOnRealmFirstEntry({ realmWelcomeSeenAt: null, pending: true })).toBe(true);
  });

  it("does not show for returning users who already have the flag", () => {
    expect(
      shouldShowRealmArrival({
        realmWelcomeSeenAt: "2026-08-24T12:00:00.000Z",
        pending: false,
        onboardingComplete: true,
      }),
    ).toBe(false);
    expect(shouldLandOnRealmFirstEntry({ realmWelcomeSeenAt: "2026-08-24T12:00:00.000Z", pending: false })).toBe(false);
  });

  it("grandfathers existing accounts when the column is absent from the payload", () => {
    expect(
      shouldShowRealmArrival({
        realmWelcomeSeenAt: undefined,
        pending: false,
        onboardingComplete: true,
      }),
    ).toBe(false);
    expect(shouldLandOnRealmFirstEntry({ realmWelcomeSeenAt: undefined, pending: false })).toBe(false);
    expect(shouldShowNavHints(undefined)).toBe(false);
  });

  it("shows nav hints only until seen", () => {
    expect(shouldShowNavHints(null)).toBe(true);
    expect(shouldShowNavHints("2026-08-24T12:00:00.000Z")).toBe(false);
  });

  it("reads optional profile timestamps without inventing seen state", () => {
    expect(readOptionalProfileTimestamp({}, "realm_welcome_seen_at")).toBeUndefined();
    expect(readOptionalProfileTimestamp({ realm_welcome_seen_at: null }, "realm_welcome_seen_at")).toBeNull();
    expect(readOptionalProfileTimestamp({ realm_welcome_seen_at: "2026-08-24T12:00:00.000Z" }, "realm_welcome_seen_at")).toBe(
      "2026-08-24T12:00:00.000Z",
    );
  });

  it("uses a real campus name when available", () => {
    expect(campusArrivalName("University of Rhode Island", "uri")).toBe("University of Rhode Island");
    expect(campusArrivalName(null, "uri")).toBe("URI");
  });
});
