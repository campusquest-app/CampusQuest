import { describe, expect, it } from "vitest";
import {
  buildExternalOrganizationNameIndex,
  isSingleExternalHostName,
  resolveExternalOrganizationIdForHost,
} from "@/lib/server/eventSources/resolveExternalHostOrganization";

describe("resolveExternalHostOrganization", () => {
  it("indexes unique names and resolves single hosts", () => {
    const index = buildExternalOrganizationNameIndex([
      { id: "a", name: "MAVE" },
      { id: "b", name: "Student Senate" },
      { id: "c", name: "mave" }, // collision with MAVE
    ]);
    expect(index.has("mave")).toBe(false);
    expect(resolveExternalOrganizationIdForHost({ organizationName: "Student Senate", nameIndex: index })).toBe(
      "b",
    );
    expect(resolveExternalOrganizationIdForHost({ organizationName: "MAVE", nameIndex: index })).toBeNull();
  });

  it("does not resolve multi-host strings", () => {
    expect(isSingleExternalHostName("Student Senate, MAVE")).toBe(false);
    expect(isSingleExternalHostName("Foo and Bar")).toBe(false);
    expect(isSingleExternalHostName("MAVE")).toBe(true);
    const index = buildExternalOrganizationNameIndex([{ id: "a", name: "MAVE" }]);
    expect(
      resolveExternalOrganizationIdForHost({
        organizationName: "Student Senate, MAVE",
        nameIndex: index,
      }),
    ).toBeNull();
  });
});
