import { normalizeQrCode } from "@/lib/qrCodeExtract";

type RedeemLockEntry = {
  idempotencyKey: string;
  release: () => void;
};

const redeemLocks = new Map<string, RedeemLockEntry>();

function lockKey(userId: string, code: string): string {
  return `${userId}:${normalizeQrCode(code)}`;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type QrRedeemLockAcquire =
  | { acquired: true; idempotencyKey: string }
  | { acquired: false; reason: "in_flight" };

/** One in-flight redeem per user+code (shared idempotency key for the API). */
export function acquireQrRedeemLock(userId: string, code: string): QrRedeemLockAcquire {
  const key = lockKey(userId, code);
  if (redeemLocks.has(key)) {
    return { acquired: false, reason: "in_flight" };
  }
  const idempotencyKey = createIdempotencyKey();
  redeemLocks.set(key, {
    idempotencyKey,
    release: () => {
      redeemLocks.delete(key);
    },
  });
  return { acquired: true, idempotencyKey };
}

export function releaseQrRedeemLock(userId: string, code: string): void {
  const key = lockKey(userId, code);
  redeemLocks.get(key)?.release();
}

export function peekQrRedeemIdempotencyKey(userId: string, code: string): string | null {
  const key = lockKey(userId, code);
  return redeemLocks.get(key)?.idempotencyKey ?? null;
}
