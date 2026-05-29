/** Extract secure CampusQuest QR token from raw scan text or deep-link URL. */
export function extractCampusQuestQrCode(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("code")?.trim();
      if (fromQuery && isCampusQuestQrCode(fromQuery)) return normalizeQrCode(fromQuery);
      const pathMatch = url.pathname.match(/\/scan\/([a-zA-Z0-9_-]+)$/);
      if (pathMatch?.[1] && isCampusQuestQrCode(pathMatch[1])) return normalizeQrCode(pathMatch[1]);
    }
  } catch {
    /* not a URL */
  }

  if (isCampusQuestQrCode(trimmed)) return normalizeQrCode(trimmed);
  return null;
}

/** Normalize scanned codes (e.g. GYM, LIBRARY) for database lookup. */
export function normalizeQrCode(value: string): string {
  const v = value.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(v)) return v;
  if (/^[A-Z0-9_]{2,32}$/.test(v.toUpperCase())) return v.toUpperCase();
  return v;
}

/** CampusQuest QR tokens: short codes (GYM) or legacy cq_* tokens. */
export function isCampusQuestQrCode(value: string): boolean {
  const v = value.trim();
  if (/^cq_[a-zA-Z0-9_-]{4,64}$/.test(v)) return true;
  if (/^[A-Z][A-Z0-9_]{1,31}$/.test(v)) return true;
  return false;
}

/** @deprecated Use isCampusQuestQrCode */
export function isSecureQrToken(value: string): boolean {
  return isCampusQuestQrCode(value);
}

export function isLegacyCampusQuestActivityJson(rawText: string): boolean {
  const t = rawText.trim();
  if (!t.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(t) as { type?: string };
    return parsed.type === "campusquest_activity";
  } catch {
    return false;
  }
}
