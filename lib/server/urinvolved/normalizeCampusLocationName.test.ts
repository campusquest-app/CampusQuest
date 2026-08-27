import { describe, expect, it } from "vitest";
import {
  extractBuildingName,
  normalizeCampusLocationName,
} from "@/lib/server/urinvolved/normalizeCampusLocationName";

describe("normalizeCampusLocationName", () => {
  it("strips floor and lounge suffixes", () => {
    expect(normalizeCampusLocationName("Weldin Hall First Floor Lounge")).toBe("weldin hall");
    expect(normalizeCampusLocationName("Weldin Hall - First Floor Lounge")).toBe("weldin hall");
    expect(normalizeCampusLocationName("Memorial Union Room 318")).toBe("memorial union");
    expect(normalizeCampusLocationName("Kingston, R.I., URI Soccer Complex")).toBe("soccer complex");
    expect(normalizeCampusLocationName("Kingston, RI, Thomas M. Ryan Center")).toBe("thomas m ryan center");
  });
});

describe("extractBuildingName", () => {
  it("extracts Weldin Hall from detailed location strings", () => {
    expect(extractBuildingName("Weldin Hall First Floor Lounge")).toBe("weldin hall");
    expect(extractBuildingName("Weldin Hall, URI")).toBe("weldin hall");
    expect(extractBuildingName("Weldin Hall - First Floor Lounge")).toBe("weldin hall");
  });
});
