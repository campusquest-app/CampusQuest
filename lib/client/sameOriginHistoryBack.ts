function referrerOrigin(referrer: string): string | null {
  const value = referrer.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Whether router.back() would stay inside CampusQuest.
 * External referrers and first-load / new-tab visits must fall back to `/`.
 */
export function canUseSameOriginHistoryBack(input: {
  historyLength: number;
  referrer: string;
  currentOrigin: string;
  /** Next.js App Router history index when present. */
  historyIdx?: number | null;
}): boolean {
  const refOrigin = referrerOrigin(input.referrer);
  if (refOrigin && refOrigin !== input.currentOrigin) return false;
  if (typeof input.historyIdx === "number") return input.historyIdx > 0;
  if (input.historyLength <= 1) return false;
  return refOrigin === input.currentOrigin;
}
