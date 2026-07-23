import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAvatarUrlCache,
  collapsedAvatarString,
  extractCustomAvatarPayload,
  normalizeUserAvatarFields,
  sanitizeAvatarUrl,
  userAvatarInitials,
} from "@/lib/userAvatar";

describe("sanitizeAvatarUrl", () => {
  beforeEach(() => clearAvatarUrlCache());

  it("rejects null, empty, and sentinel strings", () => {
    expect(sanitizeAvatarUrl(null)).toBeNull();
    expect(sanitizeAvatarUrl(undefined)).toBeNull();
    expect(sanitizeAvatarUrl("")).toBeNull();
    expect(sanitizeAvatarUrl("null")).toBeNull();
    expect(sanitizeAvatarUrl("undefined")).toBeNull();
    expect(sanitizeAvatarUrl("None")).toBeNull();
  });

  it("rejects malformed and non-http URLs", () => {
    expect(sanitizeAvatarUrl("not-a-url")).toBeNull();
    expect(sanitizeAvatarUrl("ftp://example.com/a.png")).toBeNull();
    expect(sanitizeAvatarUrl("javascript:alert(1)")).toBeNull();
  });

  it("accepts http(s) URLs and memoizes", () => {
    const url = "https://cdn.example.com/avatars/u1.png";
    expect(sanitizeAvatarUrl(url)).toBe(url);
    expect(sanitizeAvatarUrl(`  ${url}  `)).toBe(url);
  });
});

describe("userAvatarInitials", () => {
  it("uses display name parts", () => {
    expect(userAvatarInitials("Sam Rhody", "sam")).toBe("SR");
    expect(userAvatarInitials("Alex", null)).toBe("AL");
  });

  it("falls back to username", () => {
    expect(userAvatarInitials(null, "sam_rhody")).toBe("SR");
    expect(userAvatarInitials("", "@nick")).toBe("NI");
  });

  it("returns null when no usable label", () => {
    expect(userAvatarInitials(null, null)).toBeNull();
    expect(userAvatarInitials("  ", "")).toBeNull();
  });
});

describe("normalizeUserAvatarFields", () => {
  beforeEach(() => clearAvatarUrlCache());

  it("prefers uploaded photo over custom avatar", () => {
    const custom = JSON.stringify({
      v: 1,
      skin: "1",
      hair: "short",
      hairColor: "brown",
      clothes: "hoodie",
      clothesColor: "keaney",
      body: "medium",
      gender: "neutral",
      face: "smile",
    });
    const n = normalizeUserAvatarFields({
      displayName: "Sam",
      username: "sam",
      avatar_url: "https://cdn.example.com/photo.jpg",
      avatar_custom_json: custom,
    });
    expect(n.avatarType).toBe("photo");
    expect(n.profileImageUrl).toContain("cdn.example.com");
    expect(n.avatarImageUrl).toBe(custom);
  });

  it("uses custom when photo is invalid", () => {
    const custom = JSON.stringify({
      v: 1,
      skin: "1",
      hair: "short",
      hairColor: "brown",
      clothes: "hoodie",
      clothesColor: "keaney",
      body: "medium",
      gender: "neutral",
      face: "smile",
    });
    const n = normalizeUserAvatarFields({
      displayName: "Sam",
      username: "sam",
      avatar_url: "null",
      avatar_custom_json: custom,
    });
    expect(n.avatarType).toBe("custom");
    expect(n.profileImageUrl).toBeNull();
    expect(n.avatarImageUrl).toBe(custom);
  });

  it("falls back to initials when no avatar assets", () => {
    const n = normalizeUserAvatarFields({
      displayName: "Jordan Lee",
      username: "jlee",
      avatar_url: null,
      avatar_custom_json: null,
    });
    expect(n.avatarType).toBe("initials");
    expect(collapsedAvatarString(n)).toBe("🎓");
  });

  it("uses icon type when no name either", () => {
    const n = normalizeUserAvatarFields({
      displayName: "",
      username: "",
      avatar: null,
    });
    expect(n.avatarType).toBe("icon");
  });

  it("classifies legacy avatar URL string", () => {
    const n = normalizeUserAvatarFields({
      displayName: "A",
      username: "a",
      avatar: "https://example.com/a.png",
    });
    expect(n.avatarType).toBe("photo");
    expect(n.profileImageUrl).toBe("https://example.com/a.png");
  });
});

describe("extractCustomAvatarPayload", () => {
  it("rejects photo URLs and sentinels", () => {
    expect(extractCustomAvatarPayload("https://x.com/a.png")).toBeNull();
    expect(extractCustomAvatarPayload("null")).toBeNull();
  });
});
