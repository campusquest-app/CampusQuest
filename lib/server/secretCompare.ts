import { createHash, timingSafeEqual } from "crypto";

/**
 * Compare shared secrets without leaking length or prefix via early exits.
 * Both sides are hashed so the compared buffers are always the same length.
 */
export function secretsEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof provided !== "string" || typeof expected !== "string" || !provided || !expected) return false;
  const left = createHash("sha256").update(provided, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}
