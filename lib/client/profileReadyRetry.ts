import { PROFILE_SETUP_CODES } from "@/lib/client/authErrorMessages";

export const PROFILE_READY_RETRY_BUDGET_MS = 10_000;

const PENDING_CODES = new Set<string>([
  ...Array.from(PROFILE_SETUP_CODES),
  "player_setup_pending",
  "profile_setup_pending",
  "stats_setup_pending",
  "auth_user_not_ready",
  "auth_created_setup_pending",
  "signup_profile_setup_failed",
]);

function errorStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "").toLowerCase();
  }
  return "";
}

export function isProfileInitializingError(error: unknown): boolean {
  const code = errorCode(error);
  const status = errorStatus(error);
  if (PENDING_CODES.has(code)) return true;
  if (status === 404 && (code === "profile_not_found" || code === "stats_not_found" || code === "")) return true;
  if (status === 503 && (PENDING_CODES.has(code) || code === "")) return true;
  if (error instanceof Error) {
    return /finishing your account|still creating your profile|still preparing your account|still finishing your account|profile not found|stats not found/i.test(
      error.message,
    );
  }
  return false;
}

export function nextProfileReadyBackoffMs(attempt: number): number {
  return Math.min(2000, 150 * 2 ** Math.max(0, attempt - 1));
}

export function shouldContinueProfileReadyRetry(args: {
  startedAtMs: number;
  nowMs: number;
  error: unknown;
  budgetMs?: number;
}): boolean {
  if (!isProfileInitializingError(args.error)) return false;
  return args.nowMs - args.startedAtMs < (args.budgetMs ?? PROFILE_READY_RETRY_BUDGET_MS);
}
