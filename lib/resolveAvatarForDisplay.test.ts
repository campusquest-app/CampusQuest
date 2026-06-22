import { describe, expect, it } from "vitest";
import { serializeDiceBearAvatar, getDefaultDiceBearAvatar } from "@/lib/dicebearAvatar";
import {
  DEFAULT_DISPLAY_AVATAR,
  isRawAvatarPayload,
  normalizeAvatarInput,
} from "@/lib/resolveAvatarForDisplay";

describe("resolveAvatarForDisplay", () => {
  it("detects raw avatar payloads", () => {
    expect(isRawAvatarPayload('{"v":2,"options":{"backgroundType":["gradientLinear"]}}')).toBe(true);
    expect(isRawAvatarPayload({ v: 2, seed: "x", options: {} })).toBe(true);
    expect(isRawAvatarPayload("🎓")).toBe(false);
    expect(isRawAvatarPayload(serializeDiceBearAvatar(getDefaultDiceBearAvatar()))).toBe(true);
  });

  it("preserves valid dicebear JSON for AvatarDisplay", () => {
    const json = serializeDiceBearAvatar(getDefaultDiceBearAvatar());
    expect(normalizeAvatarInput(json)).toBe(json);
  });

  it("returns default emoji for invalid JSON strings", () => {
    expect(normalizeAvatarInput('{"options":{"eyes":["happy"]}}')).toBe(DEFAULT_DISPLAY_AVATAR);
    expect(normalizeAvatarInput("")).toBe(DEFAULT_DISPLAY_AVATAR);
  });

  it("coerces object payloads to JSON when parseable", () => {
    const data = getDefaultDiceBearAvatar();
    expect(normalizeAvatarInput(data)).toBe(serializeDiceBearAvatar(data));
  });

  it("keeps short emoji avatars", () => {
    expect(normalizeAvatarInput("🐏")).toBe("🐏");
  });
});
