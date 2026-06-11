import type { FieldNote } from "@/lib/types";

/** Treat common CDN URLs as images even when the path has no file extension. */
export function looksLikeImageProofUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
  if (/\/storage\/v1\/object\/public\/quad-post-images\//i.test(u)) return true;
  if (/^\/[\w./-]+\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u)) return true;
  if (/\.(jpe?g|png|gif|webp)(\?|#|$|\/)/i.test(u)) return true;
  if (/images\.unsplash\.com\/photo-/i.test(u)) return true;
  if (/upload\.wikimedia\.org\//i.test(u)) return true;
  if (/picsum\.photos\/(?:id\/|seed\/|\d)/i.test(u)) return true;
  return false;
}

export function getPostThumbnailUrl(note: FieldNote): string | null {
  const proof = note.proofUrl?.trim();
  if (proof && looksLikeImageProofUrl(proof)) return proof;
  return null;
}

export function isTextOnlyPost(note: FieldNote): boolean {
  return !getPostThumbnailUrl(note);
}

export function formatProfileTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}
