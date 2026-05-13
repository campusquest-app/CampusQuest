/** Consistent durations for PATCH /api/me/profile and Profile UI lockouts. */

export const PROFILE_DISPLAY_NAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const PROFILE_USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Next UTC instant after `changedAtIso` where a new identity change is allowed (`null` = never locked by history alone). */
export function getNextIdentityChangeEligibleAt(
  changedAtIso: string | null | undefined,
  cooldownMs: number,
): Date | null {
  if (!changedAtIso?.trim()) return null;
  const t = new Date(changedAtIso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + cooldownMs);
}

export function isProfileIdentityCooldownActive(
  changedAtIso: string | null | undefined,
  cooldownMs: number,
  nowMs = Date.now(),
): boolean {
  const eligible = getNextIdentityChangeEligibleAt(changedAtIso, cooldownMs);
  if (!eligible) return false;
  return nowMs < eligible.getTime();
}

export function formatNextChangeDateLabel(at: Date, locale?: string): string {
  try {
    return at.toLocaleDateString(locale ?? undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
