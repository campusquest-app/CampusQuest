/** Normalize XP awarded from QR scan API payloads (snake_case + camelCase). */
export function extractQrXpAwarded(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const row = result as Record<string, unknown>;
  const scan =
    row.scan && typeof row.scan === "object"
      ? (row.scan as Record<string, unknown>)
      : undefined;

  const raw =
    row.xpAwarded ??
    row.xp_awarded ??
    row.xp ??
    row.reward_xp ??
    row.xp_granted ??
    scan?.xpAwarded ??
    scan?.xp_awarded ??
    0;

  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function isQrAlreadyClaimed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const row = result as Record<string, unknown>;
  return Boolean(row.alreadyClaimed || row.duplicate || row.already_claimed);
}
