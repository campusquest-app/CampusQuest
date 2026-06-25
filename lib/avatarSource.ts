/**
 * Single source of truth for resolving a user's display avatar.
 *
 * Avatars live ONLY on the `profiles` table. They are never copied onto posts,
 * comments, messages, or notifications — every surface resolves the author's
 * CURRENT avatar from their profile at read time. This module guarantees that
 * every surface (server + client) applies the exact same precedence so a given
 * user always renders identically everywhere.
 *
 * Precedence: custom avatar (DiceBear/emoji JSON) → uploaded image URL → default.
 *
 * Framework-agnostic on purpose: importable from both server modules and client
 * components. The returned string is always safe to hand to <AvatarDisplay />.
 */

export const DEFAULT_AVATAR = "🎓";

/** snake_case profile row shape (as selected from Supabase `profiles`). */
export type ProfileAvatarRow = {
  avatar_custom_json?: string | Record<string, unknown> | null;
  avatar_url?: string | null;
};

/** camelCase DTO shape used across API responses / client models. */
export type AvatarParts = {
  /** Pre-resolved canonical avatar, if a surface already computed one. */
  avatar?: string | null;
  avatarCustomJson?: string | Record<string, unknown> | null;
  avatarUrl?: string | null;
};

function customJsonToString(raw: string | Record<string, unknown> | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "object") {
    try {
      const serialized = JSON.stringify(raw);
      if (serialized && serialized !== "{}" && serialized !== "null") return serialized;
    } catch {
      // fall through to null
    }
  }
  return null;
}

/**
 * Resolve a display avatar from a snake_case `profiles` row.
 * Use this in every server module that reads avatars.
 */
export function resolveProfileAvatar(row: ProfileAvatarRow | null | undefined): string {
  if (!row) return DEFAULT_AVATAR;
  const custom = customJsonToString(row.avatar_custom_json);
  if (custom) return custom;
  const url = (row.avatar_url ?? "").trim();
  if (url) return url;
  return DEFAULT_AVATAR;
}

/**
 * Resolve a display avatar from a camelCase DTO (API response / client model).
 * Honors a pre-resolved `avatar` field first, then applies the same precedence
 * as {@link resolveProfileAvatar}. Use this in every client resolver.
 */
export function resolveAvatarParts(parts: AvatarParts | null | undefined): string {
  if (!parts) return DEFAULT_AVATAR;
  const direct = typeof parts.avatar === "string" ? parts.avatar.trim() : "";
  if (direct) return direct;
  return resolveProfileAvatar({
    avatar_custom_json: parts.avatarCustomJson ?? null,
    avatar_url: parts.avatarUrl ?? null,
  });
}
