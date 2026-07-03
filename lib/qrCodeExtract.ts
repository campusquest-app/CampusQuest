const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function extractCodeFromScanUrl(url: URL): string | null {
  for (const key of ["code", "token", "id"]) {
    const fromQuery = url.searchParams.get(key)?.trim();
    if (fromQuery && isCampusQuestQrCode(fromQuery)) return normalizeQrCode(fromQuery);
  }
  const pathMatch = url.pathname.match(/\/scan\/([a-zA-Z0-9_-]+)$/i);
  if (pathMatch?.[1] && isCampusQuestQrCode(pathMatch[1])) return normalizeQrCode(pathMatch[1]);
  return null;
}

/** Extract secure CampusQuest QR token from raw scan text or deep-link URL. */
export function extractCampusQuestQrCode(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return extractCodeFromScanUrl(new URL(trimmed));
    }
    if (/^campusquest:\/\//i.test(trimmed)) {
      return extractCodeFromScanUrl(new URL(trimmed.replace(/^campusquest:/i, "https://campusquest.local")));
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
  // Admin-generated tokens use an uppercase CQ_ prefix and are stored that way.
  if (/^CQ_[A-Z0-9_]+$/.test(v)) return v;
  // Legacy lowercase cq_* tokens.
  if (/^cq_[a-z0-9_-]{4,64}$/.test(v)) return v.toLowerCase();
  if (/^[A-Z][A-Z0-9_]*$/.test(v)) return v;
  if (/^[A-Z0-9_]{2,32}$/.test(v.toUpperCase())) return v.toUpperCase();
  if (isUuidLike(v)) return v.toLowerCase();
  return v;
}

/** CampusQuest QR tokens: short codes (GYM), admin CQ_* tokens, legacy cq_* tokens, or UUIDs. */
export function isCampusQuestQrCode(value: string): boolean {
  const v = value.trim();
  if (/^CQ_[A-Z0-9_]{4,64}$/.test(v)) return true;
  if (/^cq_[a-z0-9_-]{4,64}$/.test(v)) return true;
  if (/^[A-Z][A-Z0-9_]{1,31}$/.test(v)) return true;
  if (isUuidLike(v)) return true;
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
