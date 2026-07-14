import { describe, expect, it } from "vitest";
import { buildGroupDisplayName, humanReadableShortName } from "@/lib/groupDisplayName";

describe("humanReadableShortName", () => {
  it("uses first word of a full display name", () => {
    expect(humanReadableShortName("Claire Boulanger")).toBe("Claire");
  });

  it("prettifies handle-like names", () => {
    expect(humanReadableShortName("claire.boulanger")).toBe("Claire");
    expect(humanReadableShortName("campusquest")).toBe("campusquest");
  });
});

describe("buildGroupDisplayName", () => {
  const members = [
    { id: "me", displayName: "Nick Lockhart", username: "nick" },
    { id: "a", displayName: "claire.boulanger", username: "claire.boulanger" },
    { id: "b", displayName: "Campus Quest", username: "campusquest" },
    { id: "c", displayName: "Sam Rivera", username: "sam" },
  ];

  it("uses saved title when present", () => {
    expect(
      buildGroupDisplayName({ title: "Study crew", members, viewerId: "me" }),
    ).toBe("Study crew");
  });

  it("excludes viewer and formats two others", () => {
    expect(
      buildGroupDisplayName({
        title: null,
        members: members.slice(0, 3),
        viewerId: "me",
      }),
    ).toBe("Claire and Campus");
  });

  it("truncates with and X others", () => {
    expect(buildGroupDisplayName({ title: null, members, viewerId: "me" })).toBe(
      "Claire, Campus, and Sam",
    );
  });

  it("uses and N others for larger groups", () => {
    const big = [
      ...members,
      { id: "d", displayName: "Alex", username: "alex" },
      { id: "e", displayName: "Jordan", username: "jordan" },
    ];
    expect(buildGroupDisplayName({ title: null, members: big, viewerId: "me" })).toBe(
      "Claire, Campus, and 3 others",
    );
  });
});
