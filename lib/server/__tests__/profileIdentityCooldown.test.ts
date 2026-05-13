import { describe, expect, it } from "vitest";
import {
  getNextIdentityChangeEligibleAt,
  isProfileIdentityCooldownActive,
  PROFILE_DISPLAY_NAME_COOLDOWN_MS,
  PROFILE_USERNAME_COOLDOWN_MS,
} from "@/lib/profileIdentityCooldown";

describe("profileIdentityCooldown", () => {
  it("returns null next-eligible when no prior change timestamp", () => {
    expect(getNextIdentityChangeEligibleAt(undefined, PROFILE_DISPLAY_NAME_COOLDOWN_MS)).toBeNull();
    expect(getNextIdentityChangeEligibleAt(null, PROFILE_DISPLAY_NAME_COOLDOWN_MS)).toBeNull();
    expect(getNextIdentityChangeEligibleAt("", PROFILE_DISPLAY_NAME_COOLDOWN_MS)).toBeNull();
  });

  it("cooldown is active until window elapses (display 7d, username 30d)", () => {
    const changedAt = "2026-01-01T00:00:00.000Z";
    const afterDisplay = new Date(changedAt).getTime() + PROFILE_DISPLAY_NAME_COOLDOWN_MS - 1;
    const afterDisplayDone = new Date(changedAt).getTime() + PROFILE_DISPLAY_NAME_COOLDOWN_MS;
    expect(
      isProfileIdentityCooldownActive(changedAt, PROFILE_DISPLAY_NAME_COOLDOWN_MS, afterDisplay),
    ).toBe(true);
    expect(
      isProfileIdentityCooldownActive(changedAt, PROFILE_DISPLAY_NAME_COOLDOWN_MS, afterDisplayDone),
    ).toBe(false);

    const afterUser = new Date(changedAt).getTime() + PROFILE_USERNAME_COOLDOWN_MS - 1;
    const afterUserDone = new Date(changedAt).getTime() + PROFILE_USERNAME_COOLDOWN_MS;
    expect(isProfileIdentityCooldownActive(changedAt, PROFILE_USERNAME_COOLDOWN_MS, afterUser)).toBe(true);
    expect(isProfileIdentityCooldownActive(changedAt, PROFILE_USERNAME_COOLDOWN_MS, afterUserDone)).toBe(false);
  });

  it("computes next eligible instant from last change", () => {
    const changedAt = "2026-05-01T12:00:00.000Z";
    const next = getNextIdentityChangeEligibleAt(changedAt, PROFILE_DISPLAY_NAME_COOLDOWN_MS);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(
      new Date(changedAt).getTime() + PROFILE_DISPLAY_NAME_COOLDOWN_MS,
    );
  });
});
