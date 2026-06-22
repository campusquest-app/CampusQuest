import { parseAvatar } from "@/lib/avatarOptions";

/** Default CampusQuest avatar when payload is missing or invalid. */
export const DEFAULT_DISPLAY_AVATAR = "🎓";

/** True when value must not be rendered as visible text in the UI. */
export function isRawAvatarPayload(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object") return true;
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (trimmed.includes("backgroundType")) return true;
  if (trimmed.includes('"options"') || trimmed.includes("skinColor")) return true;
  if (trimmed.includes('"v":2') || trimmed.includes('"v": 2')) return true;
  return false;
}

function isEmojiLike(value: string): boolean {
  const t = value.trim();
  if (!t || t.startsWith("{") || t.startsWith("[")) return false;
  return t.length <= 8;
}

function isAvatarImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Coerce any avatar field from API/store into a string safe for AvatarDisplay.
 * Never returns unparseable JSON blobs that could leak into the UI as text.
 */
export function normalizeAvatarInput(value: unknown): string {
  if (value == null) return DEFAULT_DISPLAY_AVATAR;

  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      if (parseAvatar(serialized)) return serialized;
    } catch {
      // fall through
    }
    return DEFAULT_DISPLAY_AVATAR;
  }

  if (typeof value !== "string") return DEFAULT_DISPLAY_AVATAR;

  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DISPLAY_AVATAR;

  if (parseAvatar(trimmed)) return trimmed;
  if (isAvatarImageUrl(trimmed)) return trimmed;
  if (isEmojiLike(trimmed)) return trimmed;

  if (isRawAvatarPayload(trimmed)) return DEFAULT_DISPLAY_AVATAR;

  return DEFAULT_DISPLAY_AVATAR;
}
