import { describe, expect, it } from "vitest";
import {
  detectActiveMention,
  formatWithTaggedLine,
  insertMentionAtCursor,
  dedupeTagRefs,
  clamp01,
  canViewerSeeTaggedPost,
} from "@/lib/postTags";
import { normalizeMentionSlug, allocateUniqueSlug } from "@/lib/mentionSlug";

describe("mention helpers", () => {
  it("detects active @mention query at cursor", () => {
    expect(detectActiveMention("hello @ni", 9)).toEqual({
      query: "ni",
      start: 6,
      end: 9,
    });
    expect(detectActiveMention("hello world", 5)).toBeNull();
  });

  it("inserts mention at cursor and adds trailing space", () => {
    const next = insertMentionAtCursor({
      text: "hey @jo",
      cursor: 7,
      mentionText: "jordan",
    });
    expect(next?.text).toBe("hey @jordan ");
    expect(next?.cursor).toBe("hey @jordan ".length);
  });

  it("prevents duplicate tag refs", () => {
    const deduped = dedupeTagRefs([
      { entityType: "user", entityId: "a" },
      { entityType: "user", entityId: "a" },
      { entityType: "organization", entityId: "b" },
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("formats with-line compactly", () => {
    expect(formatWithTaggedLine(["@a"])).toBe("With @a");
    expect(formatWithTaggedLine(["@a", "Senate"])).toBe("With @a and Senate");
    expect(formatWithTaggedLine(["@a", "Senate", "Event", "X"])).toBe(
      "With @a, Senate and 2 others",
    );
  });

  it("clamps photo coordinates to 0–1", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it("normalizes mention slugs without overwriting uniqueness helpers", () => {
    expect(normalizeMentionSlug("URI Student Senate")).toBe("uri_student_senate");
    const taken = new Set(["uri_student_senate"]);
    expect(allocateUniqueSlug("URI Student Senate", taken)).toBe("uri_student_senate_2");
  });

  it("preserves text around mention insertion", () => {
    const next = insertMentionAtCursor({
      text: "start @jo end",
      cursor: 9,
      mentionText: "jordan",
    });
    // Trailing space is always inserted after the mention token.
    expect(next?.text).toBe("start @jordan end");
  });

  it("returns null when cursor is not in a mention", () => {
    expect(insertMentionAtCursor({ text: "no mention here", cursor: 3, mentionText: "x" })).toBeNull();
  });

  it("handles empty with-line labels", () => {
    expect(formatWithTaggedLine([])).toBeNull();
    expect(formatWithTaggedLine(["", "  "])).toBeNull();
  });

  it("hides friends-only posts from non-friends on tagged grids", () => {
    expect(
      canViewerSeeTaggedPost({
        viewerId: "viewer",
        authorId: "author",
        visibility: "friends",
        friendAuthorIds: [],
      }),
    ).toBe(false);
    expect(
      canViewerSeeTaggedPost({
        viewerId: "viewer",
        authorId: "author",
        visibility: "friends",
        friendAuthorIds: ["author"],
      }),
    ).toBe(true);
    expect(
      canViewerSeeTaggedPost({
        viewerId: "viewer",
        authorId: "author",
        visibility: "public",
        friendAuthorIds: [],
      }),
    ).toBe(true);
    expect(
      canViewerSeeTaggedPost({
        viewerId: "author",
        authorId: "author",
        visibility: "friends",
        friendAuthorIds: [],
      }),
    ).toBe(true);
  });
});
