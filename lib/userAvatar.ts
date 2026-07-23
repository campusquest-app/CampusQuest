/**
 * Shared avatar source normalization for consistent profile-picture rendering.
 *
 * Priority (UserAvatar):
 * 1. Valid uploaded profile photo URL
 * 2. Generated / custom character avatar payload
 * 3. Initials from display name or username
 * 4. Generic user icon
 */

import { parseAvatar, isDiceBearAvatarPayload, isV1CustomAvatarData } from "@/lib/avatarOptions";
import { DEFAULT_DISPLAY_AVATAR } from "@/lib/resolveAvatarForDisplay";

export type UserAvatarType = "photo" | "custom" | "initials" | "icon";

export type NormalizedUserAvatar = {
  displayName: string;
  username: string;
  profileImageUrl: string | null;
  /** Custom/generated character payload (JSON string) safe for AvatarDisplay. */
  avatarImageUrl: string | null;
  avatarType: UserAvatarType;
};

/** Module-level cache so URL sanitization / future signed-URL work is not repeated per render. */
const resolvedUrlCache = new Map<string, string | null>();

const INVALID_URL_TOKENS = new Set(["", "null", "undefined", "none", "nil", "n/a", "-"]);

/**
 * Returns a usable http(s) image URL, or null for null/empty/"null"/malformed values.
 * Results are memoized by trimmed input.
 */
export function sanitizeAvatarUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (resolvedUrlCache.has(trimmed)) {
    return resolvedUrlCache.get(trimmed) ?? null;
  }

  const lower = trimmed.toLowerCase();
  if (INVALID_URL_TOKENS.has(lower)) {
    resolvedUrlCache.set(trimmed, null);
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    resolvedUrlCache.set(trimmed, null);
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      resolvedUrlCache.set(trimmed, null);
      return null;
    }
    // Reject obviously empty hosts
    if (!parsed.hostname) {
      resolvedUrlCache.set(trimmed, null);
      return null;
    }
    const out = parsed.toString();
    resolvedUrlCache.set(trimmed, out);
    return out;
  } catch {
    resolvedUrlCache.set(trimmed, null);
    return null;
  }
}

/** Extract a renderable custom/DiceBear avatar payload string, or null. */
export function extractCustomAvatarPayload(raw: unknown): string | null {
  if (raw == null) return null;

  if (typeof raw === "object") {
    try {
      const serialized = JSON.stringify(raw);
      return extractCustomAvatarPayload(serialized);
    } catch {
      return null;
    }
  }

  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || INVALID_URL_TOKENS.has(trimmed.toLowerCase())) return null;

  // Photo URLs are not custom payloads
  if (/^https?:\/\//i.test(trimmed)) return null;

  const parsed = parseAvatar(trimmed);
  if (!parsed) return null;
  if (isDiceBearAvatarPayload(parsed) || isV1CustomAvatarData(parsed)) return trimmed;
  return null;
}

/**
 * Initials from display name (preferred) or username.
 * Returns null when neither yields usable letters (caller should use icon).
 */
export function userAvatarInitials(
  displayName?: string | null,
  username?: string | null,
): string | null {
  const fromName = initialsFromLabel(displayName);
  if (fromName) return fromName;
  const fromUser = initialsFromLabel(username);
  if (fromUser) return fromUser;
  return null;
}

function initialsFromLabel(label?: string | null): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  // Strip leading @ for usernames
  const cleaned = trimmed.replace(/^@+/, "").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[parts.length - 1]![0] ?? "";
    const pair = `${a}${b}`.toUpperCase();
    return /[A-Z0-9]/.test(pair) ? pair : null;
  }
  const slice = cleaned.slice(0, 2).toUpperCase();
  return slice.length > 0 ? slice : null;
}

export type NormalizeUserAvatarInput = {
  displayName?: string | null;
  username?: string | null;
  /** Uploaded photo URL (profiles.avatar_url). */
  profileImageUrl?: string | null;
  avatar_url?: string | null;
  /** Custom character JSON (profiles.avatar_custom_json). */
  avatarImageUrl?: string | null;
  avatar_custom_json?: string | Record<string, unknown> | null;
  /**
   * Legacy single avatar field (URL, custom JSON, or emoji).
   * Used when separate photo/custom fields are absent.
   */
  avatar?: unknown;
};

/**
 * Normalize any profile/leaderboard avatar shape into stable render fields.
 * Photo wins over custom when both are present (UserAvatar priority).
 */
export function normalizeUserAvatarFields(input: NormalizeUserAvatarInput): NormalizedUserAvatar {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim() : "";

  let profileImageUrl =
    sanitizeAvatarUrl(input.profileImageUrl) ?? sanitizeAvatarUrl(input.avatar_url);
  let avatarImageUrl =
    extractCustomAvatarPayload(input.avatarImageUrl) ??
    extractCustomAvatarPayload(input.avatar_custom_json);

  // Legacy single field: classify into photo vs custom when dedicated fields missing
  if (!profileImageUrl && !avatarImageUrl && input.avatar != null) {
    const legacy = input.avatar;
    if (typeof legacy === "string") {
      const asUrl = sanitizeAvatarUrl(legacy);
      const asCustom = extractCustomAvatarPayload(legacy);
      if (asUrl) profileImageUrl = asUrl;
      else if (asCustom) avatarImageUrl = asCustom;
    } else {
      avatarImageUrl = extractCustomAvatarPayload(legacy);
    }
  }

  const initials = userAvatarInitials(displayName, username);
  let avatarType: UserAvatarType;
  if (profileImageUrl) avatarType = "photo";
  else if (avatarImageUrl) avatarType = "custom";
  else if (initials) avatarType = "initials";
  else avatarType = "icon";

  return {
    displayName,
    username,
    profileImageUrl,
    avatarImageUrl,
    avatarType,
  };
}

/** Legacy collapsed string for APIs that still expose a single `avatar` field. */
export function collapsedAvatarString(normalized: NormalizedUserAvatar): string {
  if (normalized.profileImageUrl) return normalized.profileImageUrl;
  if (normalized.avatarImageUrl) return normalized.avatarImageUrl;
  return DEFAULT_DISPLAY_AVATAR;
}

/** Test helper / cache reset. */
export function clearAvatarUrlCache(): void {
  resolvedUrlCache.clear();
}
