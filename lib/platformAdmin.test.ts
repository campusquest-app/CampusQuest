import { describe, expect, it } from "vitest";
import { isAdminEmailFallback, normalizeEmail } from "./platformAdmin";

describe("platformAdmin", () => {
  it("normalizes email for comparisons", () => {
    expect(normalizeEmail("  CampusQuest@CampusQuestAPP.com ")).toBe("campusquest@campusquestapp.com");
  });

  it("recognizes admin email fallbacks", () => {
    expect(isAdminEmailFallback("campusquest@campusquestapp.com")).toBe(true);
    expect(isAdminEmailFallback("nicklockhart22@gmail.com")).toBe(true);
    expect(isAdminEmailFallback("nicklockhart22@uri.edu")).toBe(true);
    expect(isAdminEmailFallback("student@uri.edu")).toBe(false);
    expect(isAdminEmailFallback("other@gmail.com")).toBe(false);
  });
});
