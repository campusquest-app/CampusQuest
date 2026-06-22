import { getMeSessionSnapshot } from "@/lib/client/meSessionCache";

export type ErrorLogContext = {
  route?: string;
  page?: string;
  component?: string;
  userId?: string | null;
  /** Extra non-sensitive metadata for debugging. */
  meta?: Record<string, unknown>;
};

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|session|api[_-]?key/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function resolveRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

function resolveUserId(explicit?: string | null): string | null {
  if (explicit) return explicit;
  if (typeof window === "undefined") return null;
  try {
    return getMeSessionSnapshot()?.userId ?? null;
  } catch {
    return null;
  }
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Error", message: typeof error === "string" ? error : "Unknown error" };
}

/**
 * Internal error logging hook. Console-only for now; structured for future Sentry wiring.
 */
export function logError(error: unknown, context: ErrorLogContext = {}): void {
  const normalized = normalizeError(error);
  const payload = {
    timestamp: new Date().toISOString(),
    error: normalized,
    route: context.route ?? resolveRoute(),
    page: context.page,
    component: context.component,
    userId: resolveUserId(context.userId),
    meta: context.meta ? redactObject(context.meta) : undefined,
  };

  console.error("[CampusQuest]", payload);

  // Future: Sentry.captureException(error, { extra: payload });
}
