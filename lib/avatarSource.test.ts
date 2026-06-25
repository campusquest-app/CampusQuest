import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, resolveAvatarParts, resolveProfileAvatar } from "@/lib/avatarSource";

describe("resolveProfileAvatar", () => {
  it("prefers the custom avatar JSON over an image URL", () => {
    expect(
      resolveProfileAvatar({
        avatar_custom_json: '{"v":2,"seed":"x"}',
        avatar_url: "https://cdn.example.com/a.png",
      }),
    ).toBe('{"v":2,"seed":"x"}');
  });

  it("falls back to the image URL when no custom avatar is set", () => {
    expect(
      resolveProfileAvatar({ avatar_custom_json: null, avatar_url: "https://cdn.example.com/a.png" }),
    ).toBe("https://cdn.example.com/a.png");
  });

  it("returns the default when nothing is set", () => {
    expect(resolveProfileAvatar({})).toBe(DEFAULT_AVATAR);
    expect(resolveProfileAvatar(null)).toBe(DEFAULT_AVATAR);
    expect(resolveProfileAvatar({ avatar_custom_json: "  ", avatar_url: "  " })).toBe(DEFAULT_AVATAR);
  });

  it("serializes object custom avatars", () => {
    expect(resolveProfileAvatar({ avatar_custom_json: { v: 2, seed: "x" } })).toBe('{"v":2,"seed":"x"}');
    expect(resolveProfileAvatar({ avatar_custom_json: {} })).toBe(DEFAULT_AVATAR);
  });

  it("keeps emoji custom avatars", () => {
    expect(resolveProfileAvatar({ avatar_custom_json: "🐏" })).toBe("🐏");
  });
});

describe("resolveAvatarParts", () => {
  it("matches resolveProfileAvatar precedence for camelCase DTOs", () => {
    expect(
      resolveAvatarParts({ avatarCustomJson: '{"v":2}', avatarUrl: "https://cdn.example.com/a.png" }),
    ).toBe('{"v":2}');
    expect(resolveAvatarParts({ avatarCustomJson: null, avatarUrl: "https://cdn.example.com/a.png" })).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(resolveAvatarParts({ avatarCustomJson: null, avatarUrl: null })).toBe(DEFAULT_AVATAR);
  });

  it("honors a pre-resolved avatar field first", () => {
    expect(resolveAvatarParts({ avatar: "🐺", avatarCustomJson: '{"v":2}', avatarUrl: null })).toBe("🐺");
  });
});
