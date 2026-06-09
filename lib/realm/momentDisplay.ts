import { parseAvatar } from "@/lib/avatarOptions";

/** Coerce moment UI fields to safe user-facing strings only. */
export function safeMomentText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function looksLikeInternalAvatarBlob(value: string): boolean {
  return (
    value.startsWith("{")
    || value.includes("options:")
    || value.includes("backgroundColor")
    || value.includes("\"v\":")
    || value.includes("'v':")
  );
}

/** Avatar string safe to pass into AvatarDisplay — never raw JSON blobs. */
export function avatarPayloadForDisplay(value: unknown): string {
  const raw = safeMomentText(value);
  if (!raw) return "🎓";
  if (parseAvatar(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.length <= 4 && !looksLikeInternalAvatarBlob(raw)) return raw;
  if (looksLikeInternalAvatarBlob(raw)) return "🎓";
  if (raw.length > 8) return "🎓";
  return raw;
}

export function isMomentAvatarImageUrl(value: unknown): boolean {
  const raw = safeMomentText(value);
  return /^https?:\/\//i.test(raw);
}

type MomentCaptionSource = {
  caption?: unknown;
  text?: unknown;
  content?: unknown;
};

export function getMomentCaption(moment: MomentCaptionSource): string {
  const value = moment.caption ?? moment.text ?? moment.content ?? "";
  return typeof value === "string" ? value : "";
}
