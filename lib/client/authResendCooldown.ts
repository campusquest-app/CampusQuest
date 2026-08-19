import { AUTH_RESEND_COOLDOWN_MS } from "@/lib/authEmailDelivery";
import { normalizeEmail } from "@/lib/platformAdmin";

export const AUTH_RESEND_COOLDOWN_STORAGE_KEY = "cq_auth_resend_cooldown_v1";

export type AuthResendCooldownState = {
  email: string;
  until: number;
};

function isState(value: unknown): value is AuthResendCooldownState {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AuthResendCooldownState>;
  return typeof row.email === "string" && Number.isFinite(row.until);
}

export function remainingResendCooldownMs(args: {
  email?: string | null;
  nowMs: number;
  stored?: AuthResendCooldownState | null;
  cooldownMs?: number;
}): number {
  const email = normalizeEmail(args.email);
  const stored = args.stored;
  if (!email || !stored || normalizeEmail(stored.email) !== email) return 0;
  return Math.max(0, stored.until - args.nowMs);
}

export function canAttemptResend(args: {
  email?: string | null;
  nowMs: number;
  stored?: AuthResendCooldownState | null;
  inFlight: boolean;
}): boolean {
  if (args.inFlight) return false;
  if (!normalizeEmail(args.email)) return false;
  return remainingResendCooldownMs(args) <= 0;
}

export function startResendCooldown(args: {
  email: string;
  nowMs: number;
  cooldownMs?: number;
}): AuthResendCooldownState {
  const cooldownMs = args.cooldownMs ?? AUTH_RESEND_COOLDOWN_MS;
  return {
    email: normalizeEmail(args.email),
    until: args.nowMs + cooldownMs,
  };
}

export function readResendCooldownState(): AuthResendCooldownState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_RESEND_COOLDOWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeResendCooldownState(state: AuthResendCooldownState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!state) {
      localStorage.removeItem(AUTH_RESEND_COOLDOWN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_RESEND_COOLDOWN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore private-mode / quota failures; in-memory cooldown still applies.
  }
}

export function formatResendCooldownLabel(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Try again in ${seconds}s`;
}
