import { describe, expect, it } from "vitest";
import { isMissingRealmConfigTableError, MARKER_POSITIONS_CONFIG_KEY } from "@/lib/server/realmMarkerPositions";

describe("realmMarkerPositions", () => {
  it("uses marker_positions config key", () => {
    expect(MARKER_POSITIONS_CONFIG_KEY).toBe("marker_positions");
  });

  it("detects missing campus_realm_config table errors", () => {
    expect(
      isMissingRealmConfigTableError({
        message: "Could not find the table 'public.campus_realm_config' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingRealmConfigTableError({ code: "42P01", message: "undefined_table" })).toBe(true);
    expect(isMissingRealmConfigTableError({ message: "permission denied" })).toBe(false);
  });
});
