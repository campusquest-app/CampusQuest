import { describe, expect, it } from "vitest";
import {
  communityIdsFromAcademicArea,
  filterAcademicChoices,
  normalizeAcademicAreaId,
  selectionFromAcademicArea,
  selectionFromMajorId,
} from "@/lib/onboarding/academicAreas";

describe("academic area catalog", () => {
  it("keeps Undecided optional and maps majors onto areas", () => {
    expect(selectionFromAcademicArea("undecided")).toEqual({ academicArea: "undecided", major: null });
    expect(selectionFromMajorId("computer_science")).toEqual({
      academicArea: "computer_science",
      major: "Computer Science",
    });
    expect(normalizeAcademicAreaId("Engineering")).toBe("engineering");
  });

  it("searches majors without requiring an extra onboarding page", () => {
    const results = filterAcademicChoices("computer");
    expect(results.majors.some((row) => row.id === "computer_science")).toBe(true);
    expect(results.areas.some((row) => row.id === "computer_science")).toBe(true);
  });

  it("does not invent conflicting stored community values for undecided", () => {
    expect(communityIdsFromAcademicArea("undecided")).toEqual([]);
    expect(communityIdsFromAcademicArea("engineering")).toEqual(["engineering"]);
  });
});
